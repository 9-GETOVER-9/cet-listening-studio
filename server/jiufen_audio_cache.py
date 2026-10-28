"""Private, deduplicated cache for audio referenced by linked Jiufen mistakes."""
import hashlib
import json
import math
import os
import queue
import re
import secrets
import tempfile
import threading
import time
from urllib.error import HTTPError
from urllib.parse import parse_qs, quote, unquote, urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


ALLOWED_HOST = 'static.9fnnn.com'
MAX_FILE_BYTES = 64 * 1024 * 1024
MAX_CACHE_BYTES = 2 * 1024 * 1024 * 1024
TICKET_TTL = 2 * 60 * 60
CHUNK_BYTES = 64 * 1024
HASH_RE = re.compile(r'^[a-f0-9]{64}$')


def audio_url(value):
    """Return the URL and clip bounds matching review-core's clip selection."""
    if not isinstance(value, dict):
        return None
    clip = value.get('manualClip') or value.get('clip')
    if not isinstance(clip, dict):
        return None
    url = value.get('audioUrl') or clip.get('url')
    start, end = clip.get('start'), clip.get('end')
    if not isinstance(url, str) or len(url) > 4096:
        return None
    if type(start) not in (int, float) or type(end) not in (int, float) or not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
        return None
    try:
        parts = urlsplit(url)
        if (parts.scheme != 'https' or parts.hostname != ALLOWED_HOST or parts.username or parts.password
                or parts.port not in (None, 443) or parts.fragment):
            return None
    except ValueError:
        return None
    return url


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class JiufenAudioCache:
    def __init__(self, store, root=None):
        self.store = store
        self.root = root or os.environ.get('JIUFEN_AUDIO_DIR', '/var/lib/listening-sync/jiufen-audio')
        os.makedirs(self.root, mode=0o700, exist_ok=True)
        try:
            os.chmod(self.root, 0o700)
        except OSError:
            pass
        self.jobs = queue.Queue()
        self.queued = set()
        self.queue_lock = threading.Lock()
        self.files_lock = threading.Lock()
        self.ticket_lock = threading.Lock()
        self.tickets = {}
        with store.connect() as c:
            c.execute('''CREATE TABLE IF NOT EXISTS jiufen_audio_cache(
                url_hash TEXT PRIMARY KEY,url TEXT NOT NULL,state TEXT NOT NULL,
                size INTEGER NOT NULL DEFAULT 0,mime TEXT,updated REAL NOT NULL,error_code TEXT)''')
            c.execute("UPDATE jiufen_audio_cache SET state='queued',updated=? WHERE state='downloading'", (time.time(),))
            pending = [r[0] for r in c.execute("SELECT url_hash FROM jiufen_audio_cache WHERE state='queued'")]
        self.opener = build_opener(ProxyHandler({}), NoRedirect)
        for digest in pending:
            self._queue(digest)
        for _ in range(2):
            threading.Thread(target=self._worker, daemon=True, name='jiufen-audio-cache').start()

    @staticmethod
    def digest_url(url):
        return hashlib.sha256(url.encode('utf-8')).hexdigest()

    def _queue(self, digest):
        if not HASH_RE.fullmatch(digest):
            return
        with self.queue_lock:
            if digest in self.queued:
                return
            self.queued.add(digest)
            self.jobs.put(digest)

    def _active_source(self, owner, source):
        with self.store.connect() as c:
            return bool(c.execute('SELECT 1 FROM jiufen_devices WHERE owner=? AND source=? AND revoked=0 LIMIT 1', (owner, source)).fetchone())

    def _content_key(self, source, card_id):
        return 'jiufen/' + quote(source, safe="~()*!.'-") + '/content/' + quote(card_id, safe="~()*!.'-")

    def _valid_card_url(self, owner, source, card_id):
        if not self._active_source(owner, source) or not isinstance(card_id, str) or not card_id or len(card_id) > 1000:
            return None
        key = self._content_key(source, card_id)
        deleted_key = key.replace('/content/', '/deleted/', 1)
        with self.store.connect() as c:
            rows = c.execute('SELECT key,value FROM jiufen_records WHERE owner=? AND key IN (?,?)', (owner, key, deleted_key)).fetchall()
        content = None
        deleted = False
        for row_key, raw in rows:
            value = json.loads(raw) if raw is not None else None
            if row_key == key:
                content = value
            elif value and value.get('deletedAt'):
                deleted = True
        if deleted:
            return None
        return audio_url(content)

    def _upsert_url(self, url, retry_failed=False):
        digest = self.digest_url(url)
        path = os.path.join(self.root, digest + '.audio')
        with self.store.connect() as c:
            row = c.execute('SELECT state FROM jiufen_audio_cache WHERE url_hash=?', (digest,)).fetchone()
            if row is None:
                c.execute("INSERT INTO jiufen_audio_cache(url_hash,url,state,updated) VALUES(?,?,'queued',?)", (digest, url, time.time()))
                state = 'queued'
            elif row[0] == 'ready' and not os.path.isfile(path):
                c.execute("UPDATE jiufen_audio_cache SET state='queued',size=0,mime=NULL,updated=?,error_code=NULL WHERE url_hash=?", (time.time(), digest))
                state = 'queued'
            elif row[0] == 'failed' and retry_failed:
                c.execute("UPDATE jiufen_audio_cache SET state='queued',updated=?,error_code=NULL WHERE url_hash=?", (time.time(), digest))
                state = 'queued'
            else:
                state = row[0]
        if state == 'queued':
            self._queue(digest)
        return digest, state

    def enqueue_source(self, owner, source, retry_failed=False):
        if not isinstance(owner, str) or not isinstance(source, str) or not source or len(source) > 200:
            raise ValueError('invalid source')
        if not self._active_source(owner, source):
            raise ValueError('source unavailable')
        with self.store.connect() as c:
            rows = c.execute('SELECT key,value FROM jiufen_records WHERE owner=?', (owner,)).fetchall()
        contents, deleted = {}, set()
        from jiufen_sync import key_parts
        for key, raw in rows:
            try:
                row_source, kind = key_parts(key)
            except (ValueError, AttributeError):
                continue
            if row_source != source:
                continue
            card_id = unquote(key.split('/')[-1])
            value = json.loads(raw) if raw is not None else None
            if kind == 'content' and value:
                contents[card_id] = value
            elif kind == 'deleted' and value and value.get('deletedAt'):
                deleted.add(card_id)
        hashes = set()
        cards_with_audio = 0
        for card_id, content in contents.items():
            if card_id in deleted:
                continue
            url = audio_url(content)
            if not url:
                continue
            cards_with_audio += 1
            digest, _ = self._upsert_url(url, retry_failed=retry_failed)
            hashes.add(digest)
        return self.summary(owner, source, card_count=max(0, len(contents)-len(deleted)), cards_with_audio=cards_with_audio, hashes=hashes)

    def enqueue_changed_source(self, owner, source):
        try:
            self.enqueue_source(owner, source, retry_failed=False)
        except ValueError:
            return

    def card_ticket(self, owner, source, card_id):
        if not isinstance(source, str) or not source or len(source) > 200:
            raise ValueError('invalid source')
        url = self._valid_card_url(owner, source, card_id)
        if not url:
            return {'state': 'missing'}
        digest, state = self._upsert_url(url)
        with self.store.connect() as c:
            row = c.execute('SELECT size,mime,state,error_code FROM jiufen_audio_cache WHERE url_hash=?', (digest,)).fetchone()
        if not row:
            return {'state': 'queued'}
        state = row[2]
        if state != 'ready':
            return {'state': state, 'errorCode': row[3]}
        ticket = secrets.token_urlsafe(32)
        now = time.time()
        with self.ticket_lock:
            self.tickets = {key: value for key, value in self.tickets.items() if value['expires'] > now}
            if len(self.tickets) >= 10000:
                self.tickets.pop(next(iter(self.tickets)))
            self.tickets[self.digest_url(ticket)] = {'owner': owner, 'source': source, 'card': card_id, 'hash': digest, 'expires': now + TICKET_TTL}
        return {'state': 'ready', 'url': '/api/jiufen/media/' + digest + '?ticket=' + ticket, 'size': row[0], 'mime': row[1]}

    def _worker(self):
        while True:
            digest = self.jobs.get()
            try:
                with self.queue_lock:
                    self.queued.discard(digest)
                self._download(digest)
            finally:
                self.jobs.task_done()

    def _download(self, digest):
        with self.store.connect() as c:
            row = c.execute('SELECT url,state FROM jiufen_audio_cache WHERE url_hash=?', (digest,)).fetchone()
            if not row or row[1] not in {'queued', 'downloading'}:
                return
            url = row[0]
            c.execute("UPDATE jiufen_audio_cache SET state='downloading',updated=?,error_code=NULL WHERE url_hash=?", (time.time(), digest))
        temp_path = None
        response = None
        try:
            current = url
            response = None
            for _ in range(4):
                parsed = urlsplit(current)
                if (parsed.scheme != 'https' or parsed.hostname != ALLOWED_HOST or parsed.username or parsed.password
                        or parsed.port not in (None, 443) or parsed.fragment):
                    raise ValueError('source_unavailable')
                request = Request(current, headers={'User-Agent': 'ListeningStudio-private-audio-cache/1', 'Accept-Encoding': 'identity'})
                try:
                    response = self.opener.open(request, timeout=25)
                    status = getattr(response, 'status', 200)
                    if status in {301, 302, 303, 307, 308}:
                        location = response.headers.get('Location', '')
                        response.close()
                        response = None
                        if not location:
                            raise ValueError('source_unavailable')
                        current = urljoin(current, location)
                        continue
                    break
                except HTTPError as error:
                    if error.code not in {301, 302, 303, 307, 308}:
                        raise
                    location = error.headers.get('Location', '')
                    error.close()
                    if not location:
                        raise ValueError('source_unavailable')
                    current = urljoin(current, location)
                    continue
            if response is None:
                raise ValueError('source_unavailable')
            status = getattr(response, 'status', 200)
            if status != 200:
                response.close()
                raise ValueError('source_unavailable')
            length = response.headers.get('Content-Length')
            if length:
                try:
                    if int(length) <= 0 or int(length) > MAX_FILE_BYTES:
                        raise ValueError('file_too_large')
                except ValueError as error:
                    if str(error) == 'file_too_large':
                        raise
                    raise ValueError('invalid_audio') from error
            mime = response.headers.get_content_type().lower()
            if not (mime.startswith('audio/') or mime in {'application/octet-stream', 'binary/octet-stream'}):
                response.close()
                raise ValueError('invalid_audio')
            fd, temp_path = tempfile.mkstemp(prefix='.jiufen-', dir=self.root)
            size = 0
            with os.fdopen(fd, 'wb') as output:
                while True:
                    chunk = response.read(CHUNK_BYTES)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_FILE_BYTES:
                        raise ValueError('file_too_large')
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
            response.close()
            if size <= 0 or (length and size != int(length)):
                raise ValueError('invalid_audio')
            path = os.path.join(self.root, digest + '.audio')
            with self.files_lock:
                with self.store.connect() as c:
                    used = c.execute("SELECT COALESCE(SUM(size),0) FROM jiufen_audio_cache WHERE state='ready' AND url_hash<>?", (digest,)).fetchone()[0]
                if used + size > MAX_CACHE_BYTES:
                    raise ValueError('cache_full')
                os.chmod(temp_path, 0o600)
                os.replace(temp_path, path)
                temp_path = None
                with self.store.connect() as c:
                    c.execute("UPDATE jiufen_audio_cache SET state='ready',size=?,mime=?,updated=?,error_code=NULL WHERE url_hash=?", (size, mime, time.time(), digest))
        except Exception as error:
            if temp_path:
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass
            code = str(error) if isinstance(error, ValueError) and str(error) in {'source_unavailable', 'file_too_large', 'invalid_audio', 'cache_full'} else 'source_unavailable'
            with self.store.connect() as c:
                c.execute("UPDATE jiufen_audio_cache SET state='failed',updated=?,error_code=? WHERE url_hash=?", (time.time(), code, digest))
        finally:
            if response is not None:
                try:
                    response.close()
                except Exception:
                    pass

    def summary(self, owner, source, card_count=None, cards_with_audio=None, hashes=None):
        if not self._active_source(owner, source):
            raise ValueError('source unavailable')
        if hashes is None:
            with self.store.connect() as c:
                rows = c.execute('SELECT key,value FROM jiufen_records WHERE owner=?', (owner,)).fetchall()
            from jiufen_sync import key_parts
            values, deleted = {}, set()
            for key, raw in rows:
                try:
                    row_source, kind = key_parts(key)
                except (ValueError, AttributeError):
                    continue
                if row_source != source:
                    continue
                card_id = unquote(key.split('/')[-1])
                value = json.loads(raw) if raw is not None else None
                if kind == 'content' and value:
                    values[card_id] = value
                elif kind == 'deleted' and value and value.get('deletedAt'):
                    deleted.add(card_id)
            urls = {self.digest_url(url) for card_id, value in values.items() if card_id not in deleted and (url := audio_url(value))}
            hashes = urls
            card_count = max(0, len(values)-len(deleted))
            cards_with_audio = sum(1 for card_id, value in values.items() if card_id not in deleted and audio_url(value))
        rows = []
        if hashes:
            with self.store.connect() as c:
                rows = c.execute('SELECT state,size FROM jiufen_audio_cache WHERE url_hash IN (' + ','.join('?' for _ in hashes) + ')', tuple(hashes)).fetchall()
        counts = {'ready': 0, 'queued': 0, 'downloading': 0, 'failed': 0}
        bytes_ready = 0
        for state, size in rows:
            if state in counts:
                counts[state] += 1
            if state == 'ready':
                bytes_ready += size
        return {'cards': card_count or 0, 'cardsWithAudio': cards_with_audio or 0, 'tracks': len(hashes), **counts, 'pending': counts['queued'] + counts['downloading'], 'readyBytes': bytes_ready}

    def serve(self, raw_path, method, range_header):
        parsed = urlsplit(raw_path)
        match = re.fullmatch(r'/api/jiufen/media/([a-f0-9]{64})', parsed.path)
        query = parse_qs(parsed.query, strict_parsing=True)
        ticket = query.get('ticket', [''])[0]
        if not match or not ticket or len(ticket) > 100:
            return None
        digest = match.group(1)
        with self.ticket_lock:
            claims = self.tickets.get(self.digest_url(ticket))
        if not claims or claims['expires'] <= time.time() or claims['hash'] != digest:
            return None
        current_url = self._valid_card_url(claims['owner'], claims['source'], claims['card'])
        if not current_url or self.digest_url(current_url) != digest:
            return None
        with self.store.connect() as c:
            row = c.execute("SELECT size,mime FROM jiufen_audio_cache WHERE url_hash=? AND state='ready'", (digest,)).fetchone()
        path = os.path.join(self.root, digest + '.audio')
        if not row or not os.path.isfile(path):
            return None
        total, mime = row
        start, end, partial = 0, total - 1, False
        if range_header:
            match = re.fullmatch(r'bytes=(\d*)-(\d*)', range_header.strip())
            if not match or (not match.group(1) and not match.group(2)):
                return {'status': 416, 'size': 0, 'total': total, 'mime': mime, 'start': 0, 'end': 0, 'path': path}
            if not match.group(1):
                suffix = int(match.group(2))
                if suffix <= 0:
                    return {'status': 416, 'size': 0, 'total': total, 'mime': mime, 'start': 0, 'end': 0, 'path': path}
                start = max(0, total - suffix)
            else:
                start = int(match.group(1))
                if match.group(2):
                    end = min(total - 1, int(match.group(2)))
            if start >= total or end < start:
                return {'status': 416, 'size': 0, 'total': total, 'mime': mime, 'start': 0, 'end': 0, 'path': path}
            partial = True
        return {'status': 206 if partial else 200, 'size': end - start + 1, 'total': total, 'mime': mime, 'start': start, 'end': end, 'path': path}
