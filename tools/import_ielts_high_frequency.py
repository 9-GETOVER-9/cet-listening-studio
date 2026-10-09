"""Import the packaged Unit vocabulary and pre-rendered bilingual walkman tracks."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import tempfile
import zipfile
from import_ielts import clean_text, answer_variants


def read_notes(package):
    with tempfile.TemporaryDirectory() as temp:
        db = Path(temp) / 'collection.anki2'
        db.write_bytes(package.read('collection.anki2'))
        conn = sqlite3.connect(db)
        try:
            return conn.execute('select id,flds from notes order by id').fetchall()
        finally:
            conn.close()


def extract_audio(package, media, field, public):
    names = re.findall(r'\[sound:([^\]]+)\]', field)
    if len(names) != 1 or names[0] not in media:
        raise ValueError(f'Missing or ambiguous audio: {field}')
    data = package.read(media[names[0]])
    if not data or not names[0].endswith('.mp3'):
        raise ValueError('Expected a nonempty MP3')
    name = hashlib.sha256(data).hexdigest()[:24] + '.mp3'
    destination = public / 'data/audio/ielts' / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    return '/data/audio/ielts/' + name


def import_units(source, bilingual, public):
    cards, tracks = [], []
    with zipfile.ZipFile(source) as package:
        media = {v: k for k, v in json.loads(package.read('media')).items()}
        for nid, joined in read_notes(package):
            audio, word, definition, origin = joined.split('\x1f')
            match = re.fullmatch(r'Unit([1-8]) #(\d+)', clean_text(origin))
            if not match:
                raise ValueError(f'Unknown unit source: {origin}')
            unit, number = map(int, match.groups())
            word, definition = clean_text(word), clean_text(definition)
            if not word or not definition:
                raise ValueError(f'Empty text: {nid}')
            start = (number - 1) // 50 * 50 + 1
            cards.append(dict(id=f'ielts-hf-{nid}', chapter=unit, number=number,
                section=f'{start:03d}-{start+49:03d}', word=word, chinese=definition,
                answers=answer_variants(word), audio=extract_audio(package, media, audio, public)))
    cards.sort(key=lambda x: (x['chapter'], x['number']))
    if len({(c['chapter'], c['number']) for c in cards}) != len(cards):
        raise ValueError('Duplicate unit numbering')
    with zipfile.ZipFile(bilingual) as package:
        media = {v: k for k, v in json.loads(package.read('media')).items()}
        for nid, joined in read_notes(package):
            audio, transcript, label = joined.split('\x1f')
            match = re.fullmatch(r'Unit ([1-8])｜(\d+)–(\d+)（(\d+) 词）', clean_text(label))
            if not match:
                raise ValueError(f'Unknown batch: {label}')
            unit, start, end, count = map(int, match.groups())
            entries = [c for c in cards if c['chapter'] == unit and start <= c['number'] <= end]
            words = [clean_text(w) for w in re.findall(r'<span class="word">(.*?)</span>', transcript)]
            if count != len(entries) or words != [c['word'] for c in entries]:
                raise ValueError(f'Batch/vocabulary mismatch: {label}')
            tracks.append(dict(id=f'ielts-road-{nid}', chapter=unit, start=start, end=end,
                label=clean_text(label), cardIds=[c['id'] for c in entries],
                audio=extract_audio(package, media, audio, public)))
    tracks.sort(key=lambda x: (x['chapter'], x['start']))
    covered = [cid for t in tracks for cid in t['cardIds']]
    if sorted(covered) != sorted(c['id'] for c in cards):
        raise ValueError('Bilingual batches must cover every vocabulary entry exactly once')
    result = dict(version='2026-10-05-hf-v1', source=source.name, cards=cards,
        tracks=tracks, pauseAfterEnglishMs=2500)
    destination = public / 'data/ielts-high-frequency-v1.json'
    destination.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    return dict(cards=len(cards), units=dict(Counter(c['chapter'] for c in cards)), tracks=len(tracks),
        dataset_sha256=hashlib.sha256(destination.read_bytes()).hexdigest(),
        source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        bilingual_sha256=hashlib.sha256(bilingual.read_bytes()).hexdigest())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--bilingual', type=Path, required=True)
    parser.add_argument('--public', type=Path, required=True)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    report = import_units(args.source, args.bilingual, args.public)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(report, ensure_ascii=False))
