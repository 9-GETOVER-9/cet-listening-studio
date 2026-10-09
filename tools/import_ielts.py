"""Offline APKG import: preserve note IDs, section order and packaged pronunciation."""
import argparse
from collections import Counter
import hashlib
import html
import json
from pathlib import Path
import re
import sqlite3
import tempfile
import zipfile


def clean_text(value):
    return ' '.join(html.unescape(re.sub(r'<[^>]*>', '', value)).split())


def answer_variants(value):
    value = clean_text(value)
    acronym = re.fullmatch(r'([A-Z]{2,})\(([^)]+)\)', value)
    if acronym:
        return list(acronym.groups())
    variants = value.split('/')
    while any(re.search(r'\([^()]*\)', v) for v in variants):
        expanded = []
        for variant in variants:
            match = re.search(r'\(([^()]*)\)', variant)
            if match:
                for replacement in ('', match[1]):
                    expanded.append(variant[:match.start()] + replacement + variant[match.end():])
            else:
                expanded.append(variant)
        variants = expanded
    return list(dict.fromkeys(clean_text(v) for v in variants if clean_text(v)))


# The source's 8.5 cheque/check note references an absent file. The same
# package has note 1667198730105 (answer cheque) with this playable clip.
AUDIO_REPAIRS = {'31131_cheque&check.mp3': '31793_cheque.mp3'}


def resolve_audio(sound, media):
    if sound in media:
        return sound
    replacement = AUDIO_REPAIRS.get(sound)
    if replacement and replacement in media:
        return replacement
    raise ValueError(f'Missing packaged audio: {sound}')


def import_corpus(source, public, chapters):
    cards = []
    repairs = []
    audio_dir = public / 'data' / 'audio' / 'ielts'
    seen = set()
    with zipfile.ZipFile(source) as package, tempfile.TemporaryDirectory() as temp:
        # This project source uses classic uncompressed collection.anki2.
        collection = Path(temp) / 'collection.anki2'
        collection.write_bytes(package.read('collection.anki2'))
        media = {name: key for key, name in json.loads(package.read('media')).items()}
        connection = sqlite3.connect(collection)
        try:
            decks = json.loads(connection.execute('select decks from col').fetchone()[0])
            rows = connection.execute('select n.id,n.flds,c.did from notes n join cards c on c.nid=n.id order by n.id').fetchall()
        finally:
            connection.close()
        for nid, fields, did in rows:
            deck = decks[str(did)]['name']
            match = re.search(r'Chapter(\d+)(?:::([\d.]+))?$', deck)
            if not match or int(match[1]) not in chapters or nid in seen:
                continue
            parts = fields.split('\x1f')
            sounds = re.findall(r'\[sound:([^\]]+)\]', html.unescape(parts[0]))
            if len(sounds) != 1:
                raise ValueError(f'Expected one packaged audio for note {nid}: {sounds}')
            sound = resolve_audio(sounds[0], media)
            if sound != sounds[0]:
                repairs.append({'note': str(nid), 'missing': sounds[0], 'replacement': sound})
            if Path(sound).suffix.lower() != '.mp3':
                raise ValueError(f'Unsupported audio: {sound}')
            content = package.read(media[sound])
            if not content:
                raise ValueError(f'Empty audio: {sound}')
            if content.lstrip().startswith(b'<html'):
                raise ValueError(f'Packaged audio is an HTML error page: note {nid}, {sound}')
            filename = hashlib.sha256(content).hexdigest()[:24] + '.mp3'
            audio_dir.mkdir(parents=True, exist_ok=True)
            target = audio_dir / filename
            if not target.exists():
                target.write_bytes(content)
            word = clean_text(parts[1])
            if not word:
                raise ValueError(f'Empty answer: {nid}')
            cards.append({'id': f'ielts-{nid}', 'chapter': int(match[1]),
                'section': match[2] or match[1], 'word': word,
                'answers': answer_variants(word), 'audio': f'/data/audio/ielts/{filename}'})
            seen.add(nid)
    cards.sort(key=lambda card: (card['chapter'], tuple(int(n) for n in card['section'].split('.')), card['id']))
    counts = Counter(card['chapter'] for card in cards)
    if set(counts) != set(chapters):
        raise ValueError(f'Missing requested chapters: {set(chapters) - set(counts)}')
    destination = public / 'data' / 'ielts-corpus-v1.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps({'version': '2026-10-05-v1', 'source': source.name, 'cards': cards}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    report = {'source': str(source), 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'chapters': dict(sorted(counts.items())), 'cards': len(cards),
        'media': len({card['audio'] for card in cards}), 'audio_repairs': repairs,
        'dataset_sha256': hashlib.sha256(destination.read_bytes()).hexdigest()}
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--public', type=Path, required=True)
    parser.add_argument('--chapters', type=int, nargs='+', required=True)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    report = import_corpus(args.source, args.public, args.chapters)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))
