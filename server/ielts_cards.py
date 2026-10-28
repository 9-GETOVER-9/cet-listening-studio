"""Authenticated access to the first ten sentence-card articles in each IELTS part."""
import json
import os
import re
import secrets
import hashlib
import threading
import time
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


ARTICLE_ID = re.compile(r"p([1-4])-a(0[1-9]|10)\Z")
class IeltsSentenceCards:
    def __init__(self, store, root=None):
        self.store = store
        self.root = Path(root or os.environ.get("IELTS_CARDS_ROOT", "/var/lib/listening-sync/ielts-cards/current")).resolve()
        self.manifest_path = self.root / "manifest.json"
        self.audio_root = self.root / "audio"
        self.lock = threading.Lock()
        self.tickets = {}

    def _articles(self):
        try:
            manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise RuntimeError("IELTS sentence-card catalog unavailable") from error
        if not isinstance(manifest, dict) or manifest.get("schemaVersion") != 1 or not isinstance(manifest.get("articles"), list):
            raise RuntimeError("IELTS sentence-card catalog invalid")
        articles = {}
        for article in manifest["articles"]:
            if not isinstance(article, dict) or not isinstance(article.get("id"), str) or not ARTICLE_ID.fullmatch(article["id"]):
                continue
            part, number = (int(value) for value in ARTICLE_ID.fullmatch(article["id"]).groups())
            audio_file = article.get("audioFile")
            audio_bytes = article.get("audioBytes")
            audio_sha256 = article.get("audioSha256")
            if (audio_file != article["id"] + ".mp3" or type(audio_bytes) is not int or audio_bytes <= 0
                    or not isinstance(audio_sha256, str) or not re.fullmatch(r"[a-f0-9]{64}", audio_sha256)):
                continue
            sentences = article.get("sentences")
            if not isinstance(sentences, list) or not sentences:
                continue
            cleaned = []
            valid = True
            for sentence in sentences:
                if not isinstance(sentence, dict):
                    valid = False
                    break
                source_index = sentence.get("sourceIndex")
                sentence_id = sentence.get("id")
                english, chinese, start, end = sentence.get("english"), sentence.get("chinese"), sentence.get("start"), sentence.get("end")
                if (type(source_index) is not int or source_index < 1 or source_index > 999
                        or sentence_id != f"{article['id']}-s{source_index:03d}"
                        or not isinstance(english, str) or not english.strip() or not isinstance(chinese, str) or not chinese.strip()
                        or type(start) not in (int, float) or type(end) not in (int, float)
                        or start < 0 or end <= start):
                    valid = False
                    break
                cleaned.append({"id": sentence_id, "sourceIndex": source_index, "english": english,
                                "chinese": chinese, "start": float(start), "end": float(end)})
            if not valid:
                continue
            articles[article["id"]] = {
                "id": article["id"], "part": part, "number": number,
                "title": str(article.get("title", ""))[:300],
                "audioFile": audio_file, "audioBytes": audio_bytes,
                "audioSha256": audio_sha256, "sentences": cleaned,
            }
        if len(articles) != 40:
            raise RuntimeError("IELTS sentence-card catalog is incomplete")
        return articles

    def catalog(self, owner):
        if not isinstance(owner, str) or not owner:
            raise PermissionError("login required")
        articles = self._articles()
        parts = []
        for part in range(1, 5):
            rows = []
            for number in range(1, 11):
                article = articles[f"p{part}-a{number:02d}"]
                rows.append({key: value for key, value in article.items() if key not in {"audioFile", "audioBytes", "audioSha256"}})
            parts.append({"part": part, "articles": rows})
        return {"status": "ready", "parts": parts}

    def ticket(self, owner, article_id):
        if not isinstance(owner, str) or not owner:
            raise PermissionError("login required")
        if not isinstance(article_id, str) or not ARTICLE_ID.fullmatch(article_id):
            raise ValueError("invalid article")
        article = self._articles().get(article_id)
        if not article:
            return {"state": "missing"}
        path = (self.audio_root / article["audioFile"]).resolve()
        if not path.is_relative_to(self.audio_root.resolve()) or not path.is_file() or path.stat().st_size != article["audioBytes"]:
            return {"state": "missing"}
        token = secrets.token_urlsafe(32)
        now = time.time()
        with self.lock:
            self.tickets = {key: value for key, value in self.tickets.items() if value["expires"] > now}
            if len(self.tickets) >= 10000:
                self.tickets.pop(next(iter(self.tickets)))
            self.tickets[hashlib.sha256(token.encode("utf-8")).hexdigest()] = {
                "owner": owner, "article": article_id, "expires": now + 2 * 60 * 60,
            }
        return {
            "state": "ready", "url": f"/api/ielts/cards/media/{article_id}?ticket={token}",
            "size": article["audioBytes"], "mime": "audio/mpeg",
        }

    def serve(self, raw_url, method, range_header):
        parsed = urlsplit(raw_url)
        match = re.fullmatch(r"/api/ielts/cards/media/(p[1-4]-a(?:0[1-9]|10))", parsed.path)
        try:
            query = parse_qs(parsed.query, strict_parsing=True)
        except ValueError:
            return None
        token = query.get("ticket", [""])[0]
        if not match or not token or len(token) > 100:
            return None
        article_id = match.group(1)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with self.lock:
            claims = self.tickets.get(token_hash)
        if not claims or claims["expires"] <= time.time() or claims["article"] != article_id:
            return None
        article = self._articles().get(article_id)
        if not article:
            return None
        path = (self.audio_root / article["audioFile"]).resolve()
        if not path.is_relative_to(self.audio_root.resolve()) or not path.is_file():
            return None
        total = path.stat().st_size
        if total <= 0 or total != article["audioBytes"]:
            return None
        start, end, partial = 0, total - 1, False
        if range_header:
            range_match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header.strip())
            if not range_match or (not range_match.group(1) and not range_match.group(2)):
                return {"status": 416, "size": 0, "total": total, "start": 0, "end": 0, "path": path}
            if not range_match.group(1):
                suffix = int(range_match.group(2))
                if suffix <= 0:
                    return {"status": 416, "size": 0, "total": total, "start": 0, "end": 0, "path": path}
                start = max(0, total - suffix)
            else:
                start = int(range_match.group(1))
                if range_match.group(2):
                    end = min(total - 1, int(range_match.group(2)))
            if start >= total or end < start:
                return {"status": 416, "size": 0, "total": total, "start": 0, "end": 0, "path": path}
            partial = True
        return {"status": 206 if partial else 200, "size": end - start + 1, "total": total, "mime": "audio/mpeg", "start": start, "end": end, "path": path}
