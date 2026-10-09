"""Explicit repair for a packaged HTML 404 masquerading as a pronunciation MP3."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
cache = ROOT / 'tools/.ielts-speech'
wave = cache / '07785206439-en.wav'
jobs = cache / 'number-repair.jsonl'
jobs.write_text(json.dumps(dict(text='zero seven seven eight five two zero six four three nine', file=str(wave))), encoding='utf8')
script = ROOT.parents[3] / 'English Saying/prototype/synthesize_mandarin_sapi.ps1'
subprocess.run(['powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(script),
    '-InputJson', str(jobs), '-OutputDir', str(cache), '-Voice', 'Microsoft Zira Desktop'], check=True)
mp3 = cache / '07785206439-en.mp3'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wave), '-ac', '1', '-ar', '24000', '-b:a', '64k', str(mp3)], check=True)
filename = hashlib.sha256(mp3.read_bytes()).hexdigest()[:24] + '.mp3'
target = ROOT / 'public/data/audio/ielts' / filename
target.write_bytes(mp3.read_bytes())
path = ROOT / 'public/data/ielts-corpus-v1.json'
data = json.loads(path.read_text(encoding='utf8'))
card = next(c for c in data['cards'] if c['id'] == 'ielts-1693987452449')
assert card['word'] == '07785206439'
previous = card['audio']
card['audio'] = '/data/audio/ielts/' + filename
card['audioNote'] = '原包音频为 HTML 404，使用本地 Microsoft Zira 英语声音逐位补读。'
path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
(ROOT / 'docs/ielts-number-audio-repair.json').write_text(json.dumps(dict(id=card['id'], word=card['word'],
    previous=previous, repaired=card['audio'], voice='Microsoft Zira Desktop', reason='Packaged 146-byte HTML 404'), ensure_ascii=False, indent=2), encoding='utf8')
print(f'repaired={card["id"]} {filename}')
