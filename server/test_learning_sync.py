import tempfile
import unittest
import threading
import json
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from pathlib import Path
from learning_sync import Store, validate_changes, make_handler


class SyncTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / 'sync.sqlite')

    def tearDown(self):
        self.tmp.cleanup()

    def change(self, key='frequency/progress/word', value=None, base=0, op='op1'):
        return dict(key=key, value=value, baseVersion=base, mutationId=op, modifiedAt=10)

    def test_accounts_are_isolated_and_duplicate_is_idempotent(self):
        change = self.change(value={'passed': True})
        first = self.store.exchange('alice', [change], 0)
        retry = self.store.exchange('alice', [change], 0)
        self.assertEqual(first['records'], retry['records'])
        self.assertEqual(self.store.exchange('bob', [], 0)['records'], [])

    def test_stale_device_cannot_overwrite_or_resurrect_deleted_word(self):
        self.store.exchange('alice', [self.change(value={'passed': True})], 0)
        conflict = self.store.exchange('alice', [self.change(value={'passed': False}, op='op2')], 0)
        self.assertEqual(conflict['acks'][0]['status'], 'conflict')
        self.assertTrue(conflict['records'][0]['value']['passed'])
        deleted = self.store.exchange('alice', [self.change(base=1, op='op3')], 0)
        self.assertIsNone(deleted['records'][0]['value'])
        self.assertEqual(deleted['records'][0]['version'], 2)

    def test_cursor_pagination_never_skips_changes(self):
        for start in range(0, 1005, 200):
            self.store.exchange('alice', [self.change(key=f'card/{i}', value={'reps': i}, op=f'op{i}') for i in range(start, min(start + 200, 1005))], 0)
        first = self.store.exchange('alice', [], 0)
        second = self.store.exchange('alice', [], first['cursor'])
        self.assertEqual(len(first['records']) + len(second['records']), 1005)
        self.assertTrue(first['more'])

    def test_protocol_rejects_audio_and_nonfinite_and_duplicate_keys(self):
        for changes in ([self.change(key='recordings/audio')], [dict(self.change(), modifiedAt=float('nan'))], [self.change(), self.change()]):
            with self.assertRaises(ValueError):
                validate_changes(changes)

    def test_http_requires_session_and_derives_owner_from_verified_token(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(self.store, lambda t: {'alice-token': 'alice', 'bob-token': 'bob'}.get(t)))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f'http://127.0.0.1:{server.server_port}/api/learning-sync'
        def request(token='', **extra):
            payload = dict(changes=[], cursor=0, **extra)
            req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
            return urllib.request.urlopen(req)
        try:
            self.store.exchange('alice', [self.change(value={'passed': True})], 0)
            for token in ('', 'forged-token'):
                with self.assertRaises(urllib.error.HTTPError) as ctx:
                    request(token)
                self.assertEqual(ctx.exception.code, 401)
            with request('bob-token') as response:
                self.assertEqual(json.load(response)['records'], [])
            with request('alice-token') as response:
                self.assertEqual(len(json.load(response)['records']), 1)
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                request('bob-token', owner='alice')
            self.assertEqual(ctx.exception.code, 400)
        finally:
            server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__':
    unittest.main()
