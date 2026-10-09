"""Render each section in short bilingual batches with the packaged English voice."""
import concurrent.futures
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from pydub import AudioSegment

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / 'public/data/ielts-corpus-v1.json'
corpus = json.loads(path.read_text(encoding='utf8'))
cache = ROOT / 'tools/.ielts-speech'
cache.mkdir(parents=True, exist_ok=True)
jobs, chinese_paths = [], {}
for card in corpus['cards']:
    meaning = card['chinese']
    target = cache / (hashlib.sha256(meaning.encode()).hexdigest()[:24] + '.wav')
    if meaning not in chinese_paths and (not target.exists() or not target.stat().st_size):
        jobs.append(dict(text=meaning, file=str(target)))
    chinese_paths[meaning] = target
jobfile = cache / 'jobs.jsonl'
jobfile.write_text('\n'.join(json.dumps(j, ensure_ascii=False) for j in jobs), encoding='utf8')
script = ROOT.parents[3] / 'English Saying/prototype/synthesize_mandarin_sapi.ps1'
if jobs:
    subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(script),
        '-InputJson', str(jobfile), '-OutputDir', str(cache), '-Voice', 'Microsoft Huihui Desktop'], check=True)
groups = defaultdict(list)
for card in corpus['cards']:
    groups[(card['chapter'], card['section'])].append(card)
batches = []
for (chapter, section), cards in groups.items():
    for start in range(0, len(cards), 40):
        batch = cards[start:start+40]
        batches.append((chapter, section, start, batch))


def render(item):
    chapter, section, start, cards = item
    signature = json.dumps([(c['audio'], c['chinese']) for c in cards], ensure_ascii=False).encode()
    name = hashlib.sha256(b'wanglu-bilingual-64k-2500-800-v1' + signature).hexdigest()[:24] + '.mp3'
    destination = ROOT / 'public/data/audio/ielts' / name
    if not destination.exists():
        chunks = []
        for card in cards:
            english = AudioSegment.from_file(ROOT / 'public' / card['audio'].lstrip('/')).set_frame_rate(24000).set_channels(1)
            chinese = AudioSegment.from_wav(chinese_paths[card['chinese']]).set_frame_rate(24000).set_channels(1)
            chunks.extend([english, AudioSegment.silent(duration=2500, frame_rate=24000), chinese,
                AudioSegment.silent(duration=800, frame_rate=24000)])
        combined = sum(chunks, AudioSegment.empty())
        combined.export(destination, format='mp3', bitrate='64k')
    print(f'rendered={section} {start+1}-{start+len(cards)}', flush=True)
    return dict(id=f'wanglu-road-{section}-{start}', chapter=chapter, section=section, start=start+1,
        end=start+len(cards), label=f'第 {chapter} 章 · {section} · {start+1}–{start+len(cards)}',
        cardIds=[c['id'] for c in cards], audio='/data/audio/ielts/' + name)


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    corpus['tracks'] = list(pool.map(render, batches))
assert sorted(cid for t in corpus['tracks'] for cid in t['cardIds']) == sorted(c['id'] for c in corpus['cards'])
corpus['version'] = '2026-10-05-wanglu-bilingual-v2'
corpus['pauseAfterEnglishMs'] = 2500
path.write_text(json.dumps(corpus, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
print(f'complete cards={len(corpus["cards"])} tracks={len(corpus["tracks"])}', flush=True)
