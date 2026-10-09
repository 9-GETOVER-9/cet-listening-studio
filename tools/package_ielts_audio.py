"""Package only the audio missing from the existing verified online release."""
import hashlib
import json
from pathlib import Path
import tarfile

ROOT = Path(__file__).resolve().parents[1]
known = {line.split()[-1].split('/')[-1] for line in (ROOT / 'docs/ielts-audio.sha256').read_text().splitlines()}
files = []
for name in ['ielts-corpus-v1.json', 'ielts-high-frequency-v1.json']:
    data = json.loads((ROOT / 'public/data' / name).read_text(encoding='utf8'))
    files.extend(ROOT / 'public' / c['audio'].lstrip('/') for c in data['cards'] + data.get('tracks', []))
files = sorted(set(files) - {p for p in files if p.name in known})
directory = ROOT / 'output/ielts-bilingual-upload'
directory.mkdir(parents=True, exist_ok=True)
manifest = ''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  data/audio/ielts/{p.name}\n' for p in files)
(directory / 'audio.sha256').write_text(manifest, encoding='utf8')
archive = directory / 'audio.tar'
with tarfile.open(archive, 'w') as tar:
    for p in files:
        tar.add(p, arcname='data/audio/ielts/' + p.name)
print(f'files={len(files)} bytes={archive.stat().st_size} sha256={hashlib.sha256(archive.read_bytes()).hexdigest()}')
part_size = (archive.stat().st_size + 7) // 8
with archive.open('rb') as source:
    for i in range(8):
        (directory / f'part-{i}').write_bytes(source.read(part_size))
