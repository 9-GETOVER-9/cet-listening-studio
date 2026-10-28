"""Account-private streaming access for the locally supplied Cambridge audio library."""
import hashlib
import json
import os
import re
import secrets
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


TRACK_ID = re.compile(r"b(\d{2})-t(\d{2})-p([1-4])\Z")
TICKET_TTL = 15 * 60
CHUNK_BYTES = 64 * 1024


class CambridgeLibrary:
    def __init__(self, store, root=None, catalog_path=None):
        self.store = store
        self.root = Path(root or os.environ.get("CAMBRIDGE_AUDIO_DIR", "/var/lib/listening-sync/cambridge-audio")).resolve()
        self.catalog_path = Path(catalog_path or os.environ.get("CAMBRIDGE_CATALOG", "/var/lib/listening-sync/cambridge-catalog.json"))
        self.tickets = {}
        with store.connect() as con:
            con.executescript("""
                CREATE TABLE IF NOT EXISTS cambridge_library_owners(
                    owner TEXT PRIMARY KEY, claimed_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS cambridge_claim_codes(
                    code_hash TEXT PRIMARY KEY, expires REAL NOT NULL,
                    used_by TEXT, used_at REAL
                );
            """)

    @staticmethod
    def _code_hash(code):
        if not isinstance(code, str) or not 12 <= len(code.strip()) <= 64:
            raise ValueError("invalid claim code")
        return hashlib.sha256(code.strip().upper().encode("utf-8")).hexdigest()

    @staticmethod
    def _ticket_hash(ticket):
        return hashlib.sha256(ticket.encode("utf-8")).hexdigest()

    def claim(self, owner, code):
        digest = self._code_hash(code)
        now = time.time()
        with self.store.connect() as con:
            con.execute("BEGIN IMMEDIATE")
            existing = con.execute("SELECT 1 FROM cambridge_library_owners WHERE owner=?", (owner,)).fetchone()
            if existing:
                return {"status": "claimed"}
            code_row = con.execute("SELECT expires,used_by FROM cambridge_claim_codes WHERE code_hash=?", (digest,)).fetchone()
            if not code_row or code_row[0] <= now or (code_row[1] and code_row[1] != owner):
                raise ValueError("invalid claim code")
            if code_row[1] == owner:
                con.execute("INSERT OR IGNORE INTO cambridge_library_owners VALUES(?,?)", (owner, now))
                return {"status": "claimed"}
            con.execute("INSERT INTO cambridge_library_owners VALUES(?,?)", (owner, now))
            con.execute("UPDATE cambridge_claim_codes SET used_by=?,used_at=? WHERE code_hash=?", (owner, now, digest))
        return {"status": "claimed"}

    def _is_owner(self, owner):
        with self.store.connect() as con:
            return bool(con.execute("SELECT 1 FROM cambridge_library_owners WHERE owner=?", (owner,)).fetchone())

    def _manifest(self):
        try:
            raw = json.loads(self.catalog_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            raise RuntimeError("Cambridge library catalog unavailable")
        if not isinstance(raw, dict) or raw.get("schemaVersion") != 1 or not isinstance(raw.get("books"), list) or not isinstance(raw.get("tracks"), list):
            raise RuntimeError("Cambridge library catalog invalid")
        tracks = {}
        for item in raw["tracks"]:
            if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not TRACK_ID.fullmatch(item["id"]):
                continue
            match = TRACK_ID.fullmatch(item["id"])
            book, test, part = (int(value) for value in match.groups())
            path = (self.root / f"book-{book:02d}" / f"test-{test:02d}" / f"part-{part}.mp3").resolve()
            if not path.is_relative_to(self.root):
                continue
            tracks[item["id"]] = {
                "id": item["id"], "book": book, "test": test, "part": part,
                "filename": str(item.get("filename", f"Part {part}.mp3"))[:180],
                "bytes": int(item.get("bytes", 0)), "path": path,
            }
        return raw, tracks

    def catalog(self, owner):
        if not self._is_owner(owner):
            raise PermissionError("library not paired")
        raw, tracks = self._manifest()
        metadata = [{key: value for key, value in item.items() if key in {"book", "label", "tests", "availableTests", "trackCount", "bytes", "missingParts"}} for item in raw["books"] if isinstance(item, dict)]
        return {"status": "ready", "books": metadata, "tracks": [{key: value for key, value in item.items() if key != "path"} for item in tracks.values()], "cardTranscriptStatus": raw.get("cardTranscriptStatus", "not-yet-aligned")}

    def ticket(self, owner, track_id):
        if not self._is_owner(owner):
            raise PermissionError("library not paired")
        if not isinstance(track_id, str) or not TRACK_ID.fullmatch(track_id):
            raise ValueError("invalid track")
        _, tracks = self._manifest()
        track = tracks.get(track_id)
        if not track or not track["path"].is_file() or track["path"].stat().st_size != track["bytes"]:
            return {"state": "missing"}
        token = secrets.token_urlsafe(32)
        now = time.time()
        self.tickets = {key: value for key, value in self.tickets.items() if value["expires"] > now}
        if len(self.tickets) >= 10000:
            self.tickets.pop(next(iter(self.tickets)))
        self.tickets[self._ticket_hash(token)] = {"owner": owner, "track": track_id, "expires": now + TICKET_TTL}
        return {"state": "ready", "url": f"/api/cambridge/media/{track_id}?ticket={token}", "size": track["bytes"], "mime": "audio/mpeg", "expiresAt": int((now + TICKET_TTL) * 1000)}

    def serve(self, raw_url, method, range_header):
        parsed = urlsplit(raw_url)
        match = re.fullmatch(r"/api/cambridge/media/(b\d{2}-t\d{2}-p[1-4])", parsed.path)
        try:
            query = parse_qs(parsed.query, strict_parsing=True)
        except ValueError:
            return None
        token = query.get("ticket", [""])[0]
        if not match or not token or len(token) > 100:
            return None
        track_id = match.group(1)
        claims = self.tickets.get(self._ticket_hash(token))
        if not claims or claims["expires"] <= time.time() or claims["track"] != track_id or not self._is_owner(claims["owner"]):
            return None
        _, tracks = self._manifest()
        track = tracks.get(track_id)
        if not track or not track["path"].is_file():
            return None
        total = track["path"].stat().st_size
        if total <= 0 or total != track["bytes"]:
            return None
        start, end, partial = 0, total - 1, False
        if range_header:
            range_match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
            if not range_match or (not range_match.group(1) and not range_match.group(2)):
                return {"status": 416, "size": 0, "total": total, "start": 0, "end": 0, "path": track["path"]}
            if not range_match.group(1):
                suffix = int(range_match.group(2))
                if suffix <= 0:
                    return {"status": 416, "size": 0, "total": total, "start": 0, "end": 0, "path": track["path"]}
                start = max(0, total - suffix)
            else:
                start = int(range_match.group(1))
                if range_match.group(2):
                    end = min(total - 1, int(range_match.group(2)))
            if start >= total or end < start:
                return {"status": 416, "size": 0, "total": total, "start": 0, "end": 0, "path": track["path"]}
            partial = True
        return {"status": 206 if partial else 200, "size": end - start + 1, "total": total, "mime": "audio/mpeg", "start": start, "end": end, "path": track["path"]}
