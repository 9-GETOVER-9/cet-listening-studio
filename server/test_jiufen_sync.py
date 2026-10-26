import json
import tempfile
import unittest
from pathlib import Path
from learning_sync import Store

class JiufenTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'sync.sqlite')
    def tearDown(self): self.tmp.cleanup()
    def pair(self, source='local'):
        p = self.store.jiufen.start(source, 'Desktop')
        self.store.jiufen.claim('alice', p['userCode'])
        return p, self.store.jiufen.status(p['pairId'], p['deviceSecret'])
    def test_pair_secret_hash_expiry_and_one_use(self):
        p, status = self.pair()
        self.assertEqual(status['status'], 'paired')
        self.assertEqual(self.store.jiufen.device(status['deviceToken'])['owner'], 'alice')
        with self.assertRaises(ValueError): self.store.jiufen.claim('bob', p['userCode'])
        with self.store.connect() as c:
            raw = str(c.execute('SELECT * FROM jiufen_pairs').fetchall()) + str(c.execute('SELECT * FROM jiufen_devices').fetchall())
            self.assertNotIn(p['userCode'], raw)
            self.assertNotIn(p['deviceSecret'], raw)
            self.assertNotIn(status['deviceToken'], raw)
            c.execute('UPDATE jiufen_pairs SET expires=0')
        self.assertEqual(self.store.jiufen.status(p['pairId'], p['deviceSecret'])['status'], 'expired')
    def test_scope_cas_idempotency_cursor_and_revocation(self):
        p, status = self.pair()
        j = self.store.jiufen
        c = dict(key='jiufen/local/note/q1',value={'content':'hello'},baseVersion=0,mutationId='a',modifiedAt=10)
        first = j.exchange('alice', [c], 0, 'local')
        self.assertEqual(first, j.exchange('alice', [c], 0, 'local'))
        conflict = j.exchange('alice', [dict(c,mutationId='b',value={'content':'late'})], 0, 'local')
        self.assertEqual(conflict['acks'][0]['status'], 'conflict')
        self.assertEqual(self.store.exchange('alice', [], 0)['records'], [])
        for owner, source in [('bob',None),('alice','other')]:
            with self.assertRaises(ValueError): j.exchange(owner,[c],0,source)
        j.revoke('bob',status['deviceId'])
        self.assertIsNotNone(j.device(status['deviceToken']))
        j.revoke('alice',status['deviceId'])
        self.assertIsNone(j.device(status['deviceToken']))
    def test_reject_secrets_and_tombstone(self):
        self.pair()
        c = dict(key='jiufen/local/content/c1',value={'token':'secret'},baseVersion=0,mutationId='a',modifiedAt=10)
        with self.assertRaises(ValueError): self.store.jiufen.exchange('alice',[c],0)
        c['value'] = None
        self.assertIsNone(self.store.jiufen.exchange('alice',[c],0)['records'][0]['value'])

    def test_source_cannot_be_stolen_and_nested_secrets_rejected(self):
        self.pair()
        other=self.store.jiufen.start('local','Other')
        with self.assertRaises(ValueError): self.store.jiufen.claim('bob',other['userCode'])
        c=dict(key='jiufen/local/content/c1',value={'source':{'access_token':'secret'}},baseVersion=0,mutationId='a',modifiedAt=10)
        with self.assertRaises(ValueError): self.store.jiufen.exchange('alice',[c],0)

    def test_http_device_auth_and_self_revoke(self):
        import threading
        import urllib.request
        import urllib.error
        from http.server import ThreadingHTTPServer
        from learning_sync import make_handler
        _,status=self.pair()
        server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(self.store,lambda t: {'web':'alice'}.get(t)))
        thread=threading.Thread(target=server.serve_forever,daemon=True); thread.start()
        def post(path,payload,token):
            req=urllib.request.Request('http://127.0.0.1:'+str(server.server_port)+path,data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+token})
            with urllib.request.urlopen(req) as r: return json.load(r)
        try:
            token=status['deviceToken']
            self.assertEqual(post('/api/jiufen/exchange',{'changes':[],'cursor':0},token)['records'],[])
            for path,payload in [('/api/learning-sync',{'changes':[],'cursor':0}),('/api/jiufen/devices',{}),('/api/jiufen/revoke',{'deviceId':'other'})]:
                with self.assertRaises(urllib.error.HTTPError) as ctx: post(path,payload,token)
                self.assertEqual(ctx.exception.code,401)
            post('/api/jiufen/revoke',{'deviceId':status['deviceId']},token)
            with self.assertRaises(urllib.error.HTTPError) as ctx: post('/api/jiufen/exchange',{'changes':[],'cursor':0},token)
            self.assertEqual(ctx.exception.code,401)
        finally:
            server.shutdown();server.server_close();thread.join()

    def test_independent_record_kinds_and_filtered_cursor(self):
        self.pair('local'); self.pair('other')
        j=self.store.jiufen
        def change(key,value,op): return dict(key=key,value=value,baseVersion=0,mutationId=op,modifiedAt=10)
        j.exchange('alice',[change('jiufen/other/note/q',{'content':'private'},'o')],0,'other')
        first=j.exchange('alice',[change('jiufen/local/content/c',{'title':'Card'},'c'),change('jiufen/local/memory/c',{'memory':{},'history':[]},'m'),change('jiufen/local/deleted/c',{'deletedAt':None},'d')],0,'local')
        self.assertEqual(len(first['records']),3)
        self.assertTrue(all('/local/' in r['key'] for r in first['records']))
        self.assertEqual(first['cursor'],4)
        tombstone=j.exchange('alice',[dict(change('jiufen/local/content/c',None,'t'),baseVersion=2)],4,'local')
        self.assertIsNone(tombstone['acks'][0]['record']['value'])
        self.assertEqual(len(j.exchange('alice',[],0)['records']),4)
        self.assertEqual(j.exchange('bob',[],0)['cursor'],0)

    def test_empty_pair_expires(self):
        pair=self.store.jiufen.start('local','Desktop')
        self.assertEqual(self.store.jiufen.status(pair['pairId'],pair['deviceSecret'])['status'],'pending')
        with self.store.connect() as c: c.execute('UPDATE jiufen_pairs SET expires=0')
        with self.assertRaises(ValueError): self.store.jiufen.claim('alice',pair['userCode'])

    def test_web_library_survives_device_revoke(self):
        _,status=self.pair()
        j=self.store.jiufen
        c=dict(key='jiufen/local/note/q',value={'content':'retained'},baseVersion=0,mutationId='saved',modifiedAt=10)
        j.exchange('alice',[c],0,'local')
        j.revoke('alice',status['deviceId'])
        self.assertIsNone(j.device(status['deviceToken']))
        self.assertEqual(j.exchange('alice',[],0)['records'][0]['value']['content'],'retained')
        self.assertEqual(j.exchange('bob',[],0)['records'],[])

    def test_exact_device_revalidated_inside_exchange(self):
        _,a=self.pair(); self.pair()
        captured=self.store.jiufen.device(a['deviceToken'])
        self.store.jiufen.revoke('alice',a['deviceId'])
        with self.assertRaises(ValueError):
            self.store.jiufen.exchange('alice',[],0,'local',device_id=captured['deviceId'])

    def test_proxy_peer_and_auth_rate_buckets_do_not_starve_other_clients(self):
        import threading
        import urllib.request
        import urllib.error
        from http.server import ThreadingHTTPServer
        from learning_sync import make_handler, client_ip
        self.assertEqual(client_ip('203.0.113.1','198.51.100.2'),'203.0.113.1')
        self.assertEqual(client_ip('127.0.0.1','198.51.100.2'),'198.51.100.2')
        server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(self.store,lambda t:'alice' if t=='web' else None))
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        def post(route,payload,token='',ip='198.51.100.1'):
            req=urllib.request.Request('http://127.0.0.1:'+str(server.server_port)+'/api/jiufen/'+route,data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+token,'X-Listening-Client-IP':ip})
            try:
                with urllib.request.urlopen(req) as response: return response.status,json.load(response)
            except urllib.error.HTTPError as e: return e.code,{}
        try:
            for i in range(12): self.assertEqual(post('pair/start',{'sourceOwner':'s','deviceName':'d'})[0],200)
            self.assertEqual(post('pair/start',{'sourceOwner':'s','deviceName':'d'})[0],429)
            self.assertEqual(post('pair/start',{'sourceOwner':'s','deviceName':'d'},ip='198.51.100.2')[0],200)
            for i in range(13): post('pair/claim',{'userCode':'invalid'})
            pair=self.store.jiufen.start('fresh','Desktop')
            self.assertEqual(post('pair/claim',{'userCode':pair['userCode']},'web')[0],200)
            status=self.store.jiufen.status(pair['pairId'],pair['deviceSecret'])
            for i in range(121): post('revoke',{'deviceId':status['deviceId']})
            self.assertEqual(post('revoke',{'deviceId':status['deviceId']},status['deviceToken'])[0],200)
        finally:
            server.shutdown();server.server_close();thread.join()
