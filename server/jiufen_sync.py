"""Scoped Jiufen pairing and learning records; all credentials are hashed at rest."""
import hashlib
import json
import secrets
import time
from jiufen_audio_cache import JiufenAudioCache
from urllib.parse import quote, unquote

CONTENT_FIELDS = {'key','title','type','unordered','source','rightAnswer','options','sentences','clip','audioUrl','manualClip','imageUrl'}
SECRET_FIELDS = {'token','accesstoken','refreshtoken','authorization','password','secret','cookie','rawsource','devicetoken','devicesecret','authtoken','apikey','jwt','sessiontoken'}
def reject_credentials(value):
    if isinstance(value,dict):
        for key,item in value.items():
            if key.lower().replace('_','').replace('-','') in SECRET_FIELDS: raise ValueError('credential field forbidden')
            reject_credentials(item)
    elif isinstance(value,list):
        for item in value: reject_credentials(item)

def digest(value): return hashlib.sha256(value.encode()).hexdigest()
def bounded(value, maximum):
    if not isinstance(value,str) or not value.strip() or len(value)>maximum: raise ValueError('invalid text')
    return value

def key_parts(key):
    parts = key.split('/') if isinstance(key,str) else []
    if len(parts)!=4 or parts[0]!='jiufen' or parts[2] not in {'content','memory','note','deleted'} or not parts[3]: raise ValueError('invalid key')
    source=unquote(parts[1])
    if quote(source,safe="~()*!.'-") != parts[1]: raise ValueError('noncanonical source')
    bounded(source,200)
    return source,parts[2]

class Jiufen:
    def __init__(self, store):
        self.store=store
        with store.connect() as c:
            c.executescript('''CREATE TABLE IF NOT EXISTS jiufen_pairs(id TEXT PRIMARY KEY, secret TEXT, code TEXT UNIQUE, source TEXT, name TEXT, expires REAL, owner TEXT, device TEXT);
            CREATE TABLE IF NOT EXISTS jiufen_devices(id TEXT PRIMARY KEY, token TEXT UNIQUE, owner TEXT, source TEXT, name TEXT, created REAL, revoked INTEGER DEFAULT 0);
            CREATE TABLE IF NOT EXISTS jiufen_clocks(owner TEXT PRIMARY KEY, seq INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS jiufen_records(owner TEXT,key TEXT,value TEXT,version INTEGER,modified_at REAL,PRIMARY KEY(owner,key));
            CREATE INDEX IF NOT EXISTS jiufen_cursor ON jiufen_records(owner,version);
            CREATE TABLE IF NOT EXISTS jiufen_operations(owner TEXT,operation TEXT,ack TEXT,PRIMARY KEY(owner,operation));''')
        self.audio = JiufenAudioCache(store)
    def start(self, source, name):
        bounded(source,200); bounded(name,100)
        pair=secrets.token_urlsafe(24); secret=secrets.token_urlsafe(32); code=secrets.token_hex(5).upper(); expires=time.time()+600
        with self.store.connect() as c:
            c.execute('DELETE FROM jiufen_pairs WHERE expires<?',(time.time(),))
            if c.execute('SELECT count(*) FROM jiufen_pairs').fetchone()[0]>=10000: raise ValueError('pair capacity')
            c.execute('INSERT INTO jiufen_pairs VALUES(?,?,?,?,?,?,NULL,NULL)',(pair,digest(secret),digest(code),source,name,expires))
        return dict(pairId=pair,deviceSecret=secret,userCode=code,expiresAt=int(expires*1000),verificationUri='https://www.listening.website/jiufen?pair='+code)
    def claim(self, owner, code):
        bounded(code,32)
        with self.store.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            row=c.execute('SELECT id,source,name FROM jiufen_pairs WHERE code=? AND expires>? AND owner IS NULL',(digest(code.strip().upper()),time.time())).fetchone()
            if not row: raise ValueError('invalid pair code')
            if c.execute('SELECT 1 FROM jiufen_devices WHERE source=? AND owner<>? AND revoked=0',(row[1],owner)).fetchone(): raise ValueError('source already bound')
            device=secrets.token_urlsafe(24)
            c.execute('INSERT INTO jiufen_devices(id,token,owner,source,name,created) VALUES(?,NULL,?,?,?,?)',(device,owner,row[1],row[2],time.time()*1000))
            c.execute('UPDATE jiufen_pairs SET owner=?,device=? WHERE id=?',(owner,device,row[0]))
        return dict(status='paired',deviceId=device,sourceOwner=row[1])
    def status(self,pair,secret):
        bounded(pair,100); bounded(secret,100)
        with self.store.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            r=c.execute('SELECT source,expires,owner,device FROM jiufen_pairs WHERE id=? AND secret=?',(pair,digest(secret))).fetchone()
            if not r: raise ValueError('invalid pair')
            if r[1]<=time.time(): return dict(status='expired')
            if not r[2]: return dict(status='pending')
            d=c.execute('SELECT revoked FROM jiufen_devices WHERE id=?',(r[3],)).fetchone()
            if not d or d[0]: return dict(status='expired')
            # Deterministic from the high-entropy device secret; database stores hashes only.
            token='jfdev_'+digest(secret+':'+pair)
            c.execute('UPDATE jiufen_devices SET token=? WHERE id=?',(digest(token),r[3]))
            return dict(status='paired',deviceToken=token,deviceId=r[3],owner=r[2],sourceOwner=r[0])
    def device(self,token):
        with self.store.connect() as c:
            row=c.execute('SELECT owner,source,id FROM jiufen_devices WHERE token=? AND revoked=0',(digest(token),)).fetchone()
            return dict(owner=row[0],sourceOwner=row[1],deviceId=row[2]) if row else None
    def devices(self,owner):
        with self.store.connect() as c:
            return dict(devices=[dict(deviceId=r[0],sourceOwner=r[1],deviceName=r[2],createdAt=r[3],revoked=bool(r[4])) for r in c.execute('SELECT id,source,name,created,revoked FROM jiufen_devices WHERE owner=?',(owner,))])
    def revoke(self,owner,device):
        bounded(device,100)
        with self.store.connect() as c: c.execute('UPDATE jiufen_devices SET revoked=1 WHERE owner=? AND id=?',(owner,device))
        return dict(status='revoked')
    def exchange(self,owner,changes,cursor,source=None,device_id=None):
        from learning_sync import validate_changes
        if not isinstance(changes,list): raise ValueError('invalid changes')
        # Reuse wire validation without widening the original sync key allowlist.
        validate_changes([dict(v,key='card/'+str(i)) for i,v in enumerate(changes)])
        if type(cursor) is not int or cursor<0: raise ValueError('invalid cursor')
        refresh_sources=set()
        with self.store.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            if device_id is not None and not c.execute('SELECT 1 FROM jiufen_devices WHERE id=? AND owner=? AND source=? AND revoked=0',(device_id,owner,source)).fetchone(): raise ValueError('device revoked')
            allowed={r[0] for r in c.execute('SELECT source FROM jiufen_devices WHERE owner=?',(owner,))}
            if source is not None and not c.execute('SELECT 1 FROM jiufen_devices WHERE owner=? AND source=? AND revoked=0',(owner,source)).fetchone(): raise ValueError('source unavailable')
            seen=set()
            for change in changes:
                key=change['key']; src,kind=key_parts(key)
                if len(key)>2000 or key in seen or src not in allowed or (source is not None and src!=source): raise ValueError('forbidden key')
                seen.add(key); value=change['value']
                if kind in {'content','deleted'}:
                    refresh_sources.add(src)
                if value is not None:
                    if not isinstance(value,dict): raise ValueError('invalid record')
                    reject_credentials(value)
                    fields={'content':CONTENT_FIELDS,'memory':{'memory','history'},'note':{'content','conflictOf','conflictAt'},'deleted':{'deletedAt'}}[kind]
                    if not set(value)<=fields: raise ValueError('invalid learning fields')
                    if kind=='note' and not isinstance(value.get('content'),str): raise ValueError('invalid note')
                    if kind=='memory' and (not isinstance(value.get('memory'),dict) or not isinstance(value.get('history'),list)): raise ValueError('invalid memory')
                    if kind=='deleted' and value.get('deletedAt') is not None and not isinstance(value['deletedAt'],str): raise ValueError('invalid deletion')
            c.execute('INSERT OR IGNORE INTO jiufen_clocks VALUES(?,0)',(owner,)); seq=c.execute('SELECT seq FROM jiufen_clocks WHERE owner=?',(owner,)).fetchone()[0]
            if cursor>seq: raise ValueError('invalid cursor')
            acks=[]
            for change in changes:
                src,_=key_parts(change['key']); op=json.dumps([src,change['mutationId']]); prior=c.execute('SELECT ack FROM jiufen_operations WHERE owner=? AND operation=?',(owner,op)).fetchone()
                if prior: acks.append(json.loads(prior[0])); continue
                row=c.execute('SELECT key,value,version,modified_at FROM jiufen_records WHERE owner=? AND key=?',(owner,change['key'])).fetchone()
                if (row[2] if row else 0)!=change['baseVersion']:
                    ack=dict(mutationId=change['mutationId'],status='conflict',record=self.store.record(row) if row else None)
                else:
                    seq+=1
                    c.execute('INSERT OR REPLACE INTO jiufen_records VALUES(?,?,?,?,?)',(owner,change['key'],json.dumps(change['value'],allow_nan=False),seq,change['modifiedAt']))
                    ack=dict(mutationId=change['mutationId'],status='accepted',record=dict(key=change['key'],value=change['value'],version=seq,modifiedAt=change['modifiedAt']))
                c.execute('INSERT INTO jiufen_operations VALUES(?,?,?)',(owner,op,json.dumps(ack))); acks.append(ack)
            c.execute('UPDATE jiufen_clocks SET seq=? WHERE owner=?',(seq,owner))
            rows=c.execute('SELECT key,value,version,modified_at FROM jiufen_records WHERE owner=? AND version>? ORDER BY version LIMIT 1001',(owner,cursor)).fetchall()
            more=len(rows)>1000; rows=rows[:1000]
            visible=[self.store.record(r) for r in rows if key_parts(r[0])[0] in allowed and (source is None or key_parts(r[0])[0]==source)]
            result=dict(acks=acks,records=visible,cursor=rows[-1][2] if rows else cursor,more=more)
        for changed_source in refresh_sources:
            self.audio.enqueue_changed_source(owner,changed_source)
        return result
