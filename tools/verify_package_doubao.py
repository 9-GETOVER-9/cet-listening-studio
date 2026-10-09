"""Verify source preservation and decode all replacement tracks before packaging."""
from concurrent.futures import ThreadPoolExecutor
from collections import Counter
import hashlib
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
before = ROOT / 'tools/.ielts-speech/before-doubao'
out = ROOT / 'output/ielts-doubao-upload'
out.mkdir(parents=True, exist_ok=True)
tracks, reports = [], []
for name in ['ielts-corpus-v1.json', 'ielts-high-frequency-v1.json']:
    path = ROOT / 'public/data' / name
    book = json.loads(path.read_text(encoding='utf8'))
    old = json.loads((before / name).read_text(encoding='utf8'))
    assert book['chineseVoice']['speaker'] == 'zh_female_tianmeitaozi_uranus_bigtts'
    assert book['cards'] == old['cards'], 'Original card content, English audio or answers changed'
    assert len(book['tracks']) == len(old['tracks'])
    for track, previous in zip(book['tracks'], old['tracks']):
        assert {k: v for k, v in track.items() if k != 'audio'} == {k: v for k, v in previous.items() if k != 'audio'}
        assert track['audio'] != previous['audio']
        tracks.append(ROOT / 'public' / track['audio'].lstrip('/'))
    assert Counter(cid for t in book['tracks'] for cid in t['cardIds']) == Counter(c['id'] for c in book['cards'])
    reports.append(dict(file=name, cards=len(book['cards']), tracks=len(book['tracks']), voice=book['chineseVoice'],
                        sha256=hashlib.sha256(path.read_bytes()).hexdigest()))


def probe(path):
    result = subprocess.run(['D:/ffmpeg/bin/ffprobe.exe', '-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', str(path)], capture_output=True, check=True)
    data = json.loads(result.stdout)['format']
    assert float(data['duration']) > 0 and int(data['size']) > 0
    return dict(file=path.name, seconds=float(data['duration']), bytes=int(data['size']))


assert len(set(tracks)) == 200
with ThreadPoolExecutor(max_workers=8) as pool:
    decoded = list(pool.map(probe, tracks))
files = sorted(set(tracks))
manifest = ''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  data/audio/ielts/{p.name}\n' for p in files)
(out / 'audio.sha256').write_text(manifest, encoding='utf8', newline='\n')
(ROOT / 'docs/ielts-doubao-audio.sha256').write_text(manifest, encoding='utf8', newline='\n')
archive = out / 'audio.tar'
with tarfile.open(archive, 'w') as tar:
    for path in files:
        tar.add(path, arcname='data/audio/ielts/' + path.name)
archive_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
report = dict(corpora=reports, originalCardsUnchanged=True, trackOrderAndCoverageUnchanged=True, decodedTracks=decoded,
              archiveBytes=archive.stat().st_size, archiveSha256=archive_hash)
(ROOT / 'docs/ielts-doubao-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
size = (archive.stat().st_size + 7) // 8
with archive.open('rb') as source:
    for index in range(8):
        (out / f'part-{index}').write_bytes(source.read(size))
print(json.dumps(dict(files=len(files), bytes=archive.stat().st_size, sha256=archive_hash)))
