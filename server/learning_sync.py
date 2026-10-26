"""Account-isolated text/state sync. Python 3.10+, standard library only."""
import hashlib
import ipaddress
from contextlib import contextmanager
import json
import math
import os
import re
import sqlite3
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PREFIXES = ('card/', 'notebook/', 'study/', 'listening/', 'notebookReview/', 'frequency/', 'reading/', 'history/', 'setting/', 'parameters/', 'listeningTime/', 'personal/')
MAX_BODY = 8 * 1024 * 1024


def validate_changes(changes):
    if not isinstance(changes, list) or len(changes) > 250:
        raise ValueError('invalid change count')
    keys = set()
    for change in changes:
        if not isinstance(change, dict) or set(change) != {'key', 'value', 'baseVersion', 'mutationId', 'modifiedAt'}:
            raise ValueError('invalid change')
        key = change['key']
        if not isinstance(key, str) or not key.startswith(PREFIXES) or len(key) > 2000 or key in keys:
            raise ValueError('invalid key')
        keys.add(key)
        if type(change['baseVersion']) is not int or change['baseVersion'] < 0:
            raise ValueError('invalid version')
        stamp = change['modifiedAt']
        if type(stamp) not in (int, float) or not math.isfinite(stamp) or not 0 <= stamp <= (time.time() + 300) * 1000:
            raise ValueError('invalid timestamp')
        if not isinstance(change['mutationId'], str) or not 1 <= len(change['mutationId']) <= 100:
            raise ValueError('invalid operation')
        if len(json.dumps(change['value'], allow_nan=False).encode()) > 2 * 1024 * 1024:
            raise ValueError('record too large')
    return changes


class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as con:
            con.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS clocks(owner TEXT PRIMARY KEY, seq INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS records(owner TEXT, key TEXT, value TEXT, version INTEGER, modified_at REAL, PRIMARY KEY(owner,key));
                CREATE INDEX IF NOT EXISTS records_cursor ON records(owner,version);
                CREATE TABLE IF NOT EXISTS operations(owner TEXT, operation TEXT, ack TEXT, PRIMARY KEY(owner,operation));
            ''')

        from jiufen_sync import Jiufen
        self.jiufen = Jiufen(self)

    @contextmanager
    def connect(self):
        con = sqlite3.connect(self.path, timeout=30)
        try:
            with con:
                yield con
        finally:
            con.close()

    @staticmethod
    def record(row):
        return dict(key=row[0], value=json.loads(row[1]), version=row[2], modifiedAt=row[3])

    def exchange(self, owner, changes, cursor):
        validate_changes(changes)
        if type(cursor) is not int or cursor < 0:
            raise ValueError('invalid cursor')
        with self.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            con.execute('INSERT OR IGNORE INTO clocks VALUES (?,0)', (owner,))
            seq = con.execute('SELECT seq FROM clocks WHERE owner=?', (owner,)).fetchone()[0]
            if cursor > seq:
                raise ValueError('invalid cursor')
            acks = []
            for change in changes:
                op = change['mutationId']
                prior = con.execute('SELECT ack FROM operations WHERE owner=? AND operation=?', (owner, op)).fetchone()
                if prior:
                    acks.append(json.loads(prior[0]))
                    continue
                row = con.execute('SELECT key,value,version,modified_at FROM records WHERE owner=? AND key=?', (owner, change['key'])).fetchone()
                if (row[2] if row else 0) != change['baseVersion']:
                    ack = dict(mutationId=op, status='conflict', record=self.record(row))
                else:
                    seq += 1
                    con.execute('INSERT OR REPLACE INTO records VALUES (?,?,?,?,?)', (owner, change['key'], json.dumps(change['value'], allow_nan=False), seq, change['modifiedAt']))
                    ack = dict(mutationId=op, status='accepted', record=dict(key=change['key'], value=change['value'], version=seq, modifiedAt=change['modifiedAt']))
                con.execute('INSERT INTO operations VALUES (?,?,?)', (owner, op, json.dumps(ack)))
                acks.append(ack)
            con.execute('UPDATE clocks SET seq=? WHERE owner=?', (seq, owner))
            rows = con.execute('SELECT key,value,version,modified_at FROM records WHERE owner=? AND version>? ORDER BY version LIMIT 1001', (owner, cursor)).fetchall()
            more = len(rows) > 1000
            rows = rows[:1000]
            return dict(acks=acks, records=[self.record(r) for r in rows], cursor=rows[-1][2] if rows else cursor, more=more)


class Authenticator:
    def __init__(self, url, anon_key):
        if not url.startswith('https://'):
            raise ValueError('HTTPS auth URL required')
        self.url = url.rstrip('/') + '/auth/v1/user'
        self.key = anon_key
        self.cache = {}
        self.lock = threading.Lock()

    def __call__(self, token):
        digest = hashlib.sha256(token.encode()).hexdigest()
        with self.lock:
            cached = self.cache.get(digest)
            if cached and cached[1] > time.time():
                return cached[0]
        request = urllib.request.Request(self.url, headers={'apikey': self.key, 'Authorization': 'Bearer ' + token})
        try:
            with urllib.request.urlopen(request, timeout=12) as response:
                user = json.load(response)
            owner = user.get('id')
            if not isinstance(owner, str) or not re.fullmatch(r'[a-fA-F0-9-]{36}', owner):
                return None
            with self.lock:
                if len(self.cache) > 1000:
                    self.cache.clear()
                self.cache[digest] = (owner, time.time() + 20)
            return owner
        except Exception:
            return None


def client_ip(peer, forwarded):
    """Only the loopback nginx boundary may supply its overwritten client header."""
    try:
        if ipaddress.ip_address(peer).is_loopback and forwarded:
            return str(ipaddress.ip_address(forwarded))
    except ValueError:
        pass
    return peer


def make_handler(store, authenticate):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            pass  # Never log tokens or personal content.

        def reply(self, status, value):
            body = json.dumps(value, allow_nan=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        rate_lock = threading.Lock()
        rate = {}

        def limited(self, bucket, limit):
            now = time.time()
            with self.rate_lock:
                count, until = self.rate.get(bucket, (0, now + 60))
                if until <= now:
                    count, until = 0, now + 60
                if count >= limit:
                    return True
                self.rate[bucket] = (count + 1, until)
                if len(self.rate) > 10000:
                    for expired in [k for k,v in self.rate.items() if v[1] <= now]:
                        del self.rate[expired]
            return False

        def jiufen_post(self):
            try:
                route = self.path.removeprefix('/api/jiufen/')
                if route not in {'pair/start','pair/status','pair/claim','devices','revoke','exchange'}:
                    return self.reply(404, {'error':'not found'})
                ip = client_ip(self.client_address[0], self.headers.get('X-Listening-Client-IP'))
                if route in {'pair/start','pair/status'} and self.limited(('peer',ip,route),12 if route=='pair/start' else 120):
                    return self.reply(429, {'error':'too many requests'})
                size = int(self.headers.get('Content-Length','0'))
                if not 0<size <= (MAX_BODY if route=='exchange' else 4096):
                    return self.reply(413, {'error':'invalid request size'})
                payload=json.loads(self.rfile.read(size))
                expected={'pair/start':{'sourceOwner','deviceName'},'pair/status':{'pairId','deviceSecret'},'pair/claim':{'userCode'},'devices':set(),'revoke':{'deviceId'},'exchange':{'changes','cursor'}}[route]
                if not isinstance(payload,dict) or set(payload)!=expected: raise ValueError('invalid request')
                j=store.jiufen
                if route=='pair/start': return self.reply(200,j.start(payload['sourceOwner'],payload['deviceName']))
                if route=='pair/status': return self.reply(200,j.status(payload['pairId'],payload['deviceSecret']))
                header=self.headers.get('Authorization','')
                token=header[7:] if header.startswith('Bearer ') else ''
                if not token or len(token)>16384: return self.reply(401,{'error':'login required'})
                device=j.device(token) if token.startswith('jfdev_') else None
                if token.startswith('jfdev_'):
                    if not device or route not in {'exchange','revoke'} or (route=='revoke' and payload['deviceId']!=device['deviceId']): return self.reply(401,{'error':'invalid device'})
                    owner=device['owner']
                else:
                    owner=authenticate(token)
                    if not owner: return self.reply(401,{'error':'session expired'})
                identity = ('device',device['deviceId']) if device else ('account',owner)
                if self.limited(identity+(route,),12 if route=='pair/claim' else 120):
                    return self.reply(429,{'error':'too many requests'})
                if route=='pair/claim': result=j.claim(owner,payload['userCode'])
                elif route=='devices': result=j.devices(owner)
                elif route=='revoke': result=j.revoke(owner,payload['deviceId'])
                else: result=j.exchange(owner,payload['changes'],payload['cursor'],device['sourceOwner'] if device else None,device_id=device['deviceId'] if device else None)
                return self.reply(200,result)
            except (ValueError,TypeError,KeyError,RecursionError):
                return self.reply(400,{'error':'invalid Jiufen data'})
            except Exception:
                return self.reply(503,{'error':'sync temporarily unavailable'})

        def do_POST(self):
            if self.path.startswith('/api/jiufen/'):
                return self.jiufen_post()
            if self.path != '/api/learning-sync':
                return self.reply(404, {'error': 'not found'})
            header = self.headers.get('Authorization', '')
            token = header[7:] if header.startswith('Bearer ') else ''
            if not token or token.startswith('jfdev_') or len(token) > 16384:
                return self.reply(401, {'error': 'login required'})
            owner = authenticate(token)
            if not owner:
                return self.reply(401, {'error': 'session expired'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= MAX_BODY:
                    return self.reply(413, {'error': 'invalid request size'})
                payload = json.loads(self.rfile.read(size))
                if not isinstance(payload, dict) or set(payload) != {'changes', 'cursor'}:
                    raise ValueError('invalid request')
                return self.reply(200, store.exchange(owner, payload['changes'], payload['cursor']))
            except (ValueError, TypeError, KeyError, RecursionError):
                return self.reply(400, {'error': 'invalid sync data'})
            except Exception:
                return self.reply(503, {'error': 'sync temporarily unavailable'})
    return Handler


if __name__ == '__main__':
    store = Store(os.environ.get('SYNC_DB', '/var/lib/listening-sync/progress.sqlite'))
    auth = Authenticator(os.environ['SUPABASE_URL'], os.environ['SUPABASE_ANON_KEY'])
    ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('SYNC_PORT', '3197'))), make_handler(store, auth)).serve_forever()
