"""Offline Doubao Chinese dubbing. Planning is free; preview/generate call paid TTS.

python tools/doubao_ielts_voice.py --plan
python tools/doubao_ielts_voice.py --preview
python tools/doubao_ielts_voice.py --generate
Never put API credentials in a VITE_ variable or public/.
"""
import argparse
import base64
import concurrent.futures
import datetime
import hashlib
import json
import os
import re
from pathlib import Path
import uuid
import time
import threading
import requests

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'doubao.local'
ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'


def decode_stream(lines):
    chunks, complete = [], False
    for line in lines:
        if not line.strip():
            continue
        item = json.loads(line)
        if item['code'] == 20000000:
            complete = True
        elif item['code'] != 0:
            reason = re.sub(r'[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}', '[redacted]', str(item.get('message', '')))
            raise ValueError(f'TTS failed: code={item["code"]}; {reason}')
        if item.get('data'):
            chunks.append(base64.b64decode(item['data'], validate=True))
    if not complete or not chunks:
        raise ValueError('Incomplete or empty TTS audio; not cached')
    return b''.join(chunks)


def spoken_chinese(text):
    text = re.sub(r'(?<![A-Za-z])(?:adj|adv|prep|pron|conj|num|art|int|aux|phr|vt|vi|n|v)\s*[.．]?\s*/', '，', text)
    return re.sub(r'\s*，\s*', '，', text).strip('， /')


def make_plan(books):
    texts = {spoken_chinese(card['chinese']) for book in books for card in book['cards']}
    if '' in texts:
        raise ValueError('Missing Chinese definition')
    return dict(cards=sum(len(b['cards']) for b in books), tracks=sum(len(b['tracks']) for b in books),
                uniqueTexts=len(texts), characters=sum(map(len, texts)))


def make_payload(text, speaker, instruction):
    return dict(user=dict(uid='ielts-offline-dubbing'), req_params=dict(text=text, speaker=speaker,
                audio_params=dict(format='mp3', sample_rate=24000),
                additions=json.dumps(dict(context_texts=[instruction]), ensure_ascii=False)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--plan', action='store_true')
    mode.add_argument('--preview', action='store_true')
    mode.add_argument('--generate', action='store_true')
    parser.add_argument('--workers', type=int, default=4, choices=range(1, 9), help='Bounded TTS concurrency; lower if the account is rate-limited')
    args = parser.parse_args()
    paths = [ROOT / 'public/data/ielts-corpus-v1.json', ROOT / 'public/data/ielts-high-frequency-v1.json']
    books = [json.loads(p.read_text(encoding='utf8')) for p in paths]
    plan = make_plan(books)
    print(json.dumps(plan, ensure_ascii=False))
    if args.plan:
        return
    config = json.loads(CONFIG.read_text(encoding='utf-8-sig')) if CONFIG.exists() else {}
    key = os.environ.get('DOUBAO_TTS_API_KEY') or config.get('apiKey')
    speaker = config.get('speaker', 'zh_female_tianmeitaozi_uranus_bigtts')
    resource = config.get('resourceId', 'seed-tts-2.0')
    instruction = config.get('instruction', '请用甜美温柔、自然清晰的普通话朗读，适合英语词汇学习。')
    if not key:
        raise SystemExit('Set apiKey in doubao.local or DOUBAO_TTS_API_KEY. No API call made.')
    if args.generate:
        print('Generating both books; successful Chinese clips are cached for resumption.', flush=True)
    cache = ROOT / 'tools/.ielts-speech/doubao'
    cache.mkdir(parents=True, exist_ok=True)
    connections = threading.local()

    def synthesize(text):
        signature = json.dumps([resource, speaker, instruction, text], ensure_ascii=False).encode()
        target = cache / (hashlib.sha256(signature).hexdigest()[:24] + '.mp3')
        if target.exists() and target.stat().st_size:
            return target
        body = make_payload(text, speaker, instruction)
        headers = {
            'Content-Type': 'application/json', 'X-Api-Key': key, 'X-Api-Resource-Id': resource,
            'X-Api-Request-Id': str(uuid.uuid4())}
        if not hasattr(connections, 'session'):
            connections.session = requests.Session()
        for attempt in range(5):
            try:
                headers['X-Api-Request-Id'] = str(uuid.uuid4())
                with connections.session.post(ENDPOINT, json=body, headers=headers, timeout=60, stream=True) as response:
                    response.raise_for_status()
                    audio = decode_stream(response.iter_lines())
                break
            except requests.HTTPError as error:
                status = error.response.status_code
                if attempt == 4 or status not in (429, 500, 502, 503, 504):
                    raise RuntimeError(f'Doubao HTTP {status}; check service activation, key and balance.') from None
            except (requests.ConnectionError, requests.Timeout):
                if attempt == 4:
                    raise RuntimeError('Doubao connection failed after retries; cached clips retained.') from None
            except ValueError as error:
                if attempt == 4 or not any(s in str(error).lower() for s in ['concurrency', 'rate limit']):
                    raise RuntimeError(str(error).replace(key, '[redacted]')) from None
            time.sleep(2 ** attempt)
        temp = target.with_suffix('.tmp')
        temp.write_bytes(audio); temp.replace(target)
        return target

    if args.preview:
        sample = synthesize('你好，我们一起来练习雅思听力。研究助理。图书馆。免费入场。濒危物种。')
        print('Preview audio: ' + str(sample))
        return
    texts = sorted({spoken_chinese(c['chinese']) for b in books for c in b['cards']})
    chinese = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        pending = {pool.submit(synthesize, text): text for text in texts}
        try:
            for index, job in enumerate(concurrent.futures.as_completed(pending), 1):
                chinese[pending[job]] = job.result()
                if index % 50 == 0 or index == len(texts):
                    print(f'Chinese clips: {index}/{len(texts)}', flush=True)
        except BaseException:
            for job in pending:
                job.cancel()
            raise
    from pydub import AudioSegment
    output = ROOT / 'public/data/audio/ielts'
    def render(item):
        track, entries = item
        signature = json.dumps([resource, speaker, instruction, [(c['audio'], spoken_chinese(c['chinese'])) for c in entries]], ensure_ascii=False).encode()
        filename = hashlib.sha256(b'doubao-ielts-2500-800-64k-v1' + signature).hexdigest()[:24] + '.mp3'
        destination = output / filename
        if not destination.exists():
            chunks = []
            for card in entries:
                english = AudioSegment.from_file(ROOT / 'public' / card['audio'].lstrip('/')).set_frame_rate(24000).set_channels(1)
                mandarin = AudioSegment.from_file(chinese[spoken_chinese(card['chinese'])]).set_frame_rate(24000).set_channels(1)
                chunks.extend([english, AudioSegment.silent(duration=2500, frame_rate=24000), mandarin,
                               AudioSegment.silent(duration=800, frame_rate=24000)])
            temp = destination.with_suffix('.tmp')
            sum(chunks, AudioSegment.empty()).export(temp, format='mp3', bitrate='64k')
            temp.replace(destination)
        return track, '/data/audio/ielts/' + filename

    jobs = []
    for book in books:
        cards = {c['id']: c for c in book['cards']}
        jobs.extend((track, [cards[cid] for cid in track['cardIds']]) for track in book['tracks'])
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for index, (track, audio) in enumerate(pool.map(render, jobs), 1):
            track['audio'] = audio
            if index % 10 == 0 or index == len(jobs):
                print(f'Bilingual tracks: {index}/{len(jobs)}', flush=True)
    for book in books:
        names = {'zh_female_tianmeitaozi_uranus_bigtts': '甜美桃子 2.0', 'zh_female_tianmeixiaoyuan_uranus_bigtts': '甜美小源 2.0'}
        book['chineseVoice'] = dict(provider='Doubao', speaker=speaker, resourceId=resource, name=names.get(speaker, speaker))
        book['version'] += '-doubao-' + datetime.datetime.now().strftime('%Y%m%d%H%M%S')
    # Corpus files change only after both books render successfully. No deployment is automatic.
    for path, book in zip(paths, books):
        temp = path.with_suffix('.tmp')
        temp.write_text(json.dumps(book, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
        temp.replace(path)
    print('Both local corpora prepared. Verify, upload new audio, then deploy the corpus manifests.')


if __name__ == '__main__':
    main()
