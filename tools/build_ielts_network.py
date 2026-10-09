"""Build the distinct Sword20 network corpus and publish existing Chinese cache.

Uses only stdlib and local files. Never reads credentials or calls speech APIs.
Run: python tools/build_ielts_network.py --source path/to/listening.apkg
"""
import argparse
from collections import Counter, defaultdict
from contextlib import closing
import hashlib
import html
import json
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile
import unicodedata
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(r'D:\桌面\Project\Self\English Saying\deliverables\剑20_3_4_5_8_11_vs_高频语料库\听力语料库.apkg')
RESOURCE = 'seed-tts-2.0'
SPEAKER = 'zh_female_tianmeitaozi_uranus_bigtts'
INSTRUCTION = '请用甜美温柔、自然清晰的普通话朗读，适合英语词汇学习。'
CHAPTERS = (3, 4, 5, 8, 11)


def normalize_word(text):
    text = html.unescape(re.sub(r'<[^>]*>', '', str(text)))
    text = unicodedata.normalize('NFKC', text).lower()
    text = text.translate(str.maketrans({'‘': "'", '’': "'", '“': '"', '”': '"',
                                        '‐': '-', '‑': '-', '‒': '-', '–': '-', '—': '-', '−': '-'}))
    return re.sub(r'\s+', ' ', text).strip()


def read_apkg_notes(source):
    """Read classic APKG fields in original note order without extracting media."""
    with zipfile.ZipFile(source) as archive, tempfile.TemporaryDirectory() as temp:
        database = Path(temp, 'collection.anki2')
        database.write_bytes(archive.read('collection.anki2'))
        with closing(sqlite3.connect(database)) as connection:
            models = json.loads(connection.execute('select models from col').fetchone()[0])
            notes = []
            for note_id, model_id, fields in connection.execute('select id, mid, flds from notes order by id'):
                names = [field['name'] for field in models[str(model_id)]['flds']]
                values = fields.split('\x1f')
                if len(names) != len(values):
                    raise ValueError(f'Invalid field count for note {note_id}')
                note = dict(zip(names, values))
                note['id'] = note_id
                notes.append(note)
    return notes


def _audio_file(public_root, path):
    public_root = Path(public_root).resolve()
    target = (public_root / str(path).lstrip('/')).resolve()
    if not str(path).startswith('/data/audio/') or not target.is_relative_to(public_root):
        raise ValueError(f'Invalid audio path: {path}')
    if not target.is_file() or not target.stat().st_size:
        raise ValueError(f'Missing audio: {path}')
    return target


def build_network(notes, wanglu, frequency, public_root, chinese_index=None):
    references = defaultdict(list)
    for card in wanglu['cards']:
        references[normalize_word(card['word'])].append(card)
    frequent = {normalize_word(card['word']) for card in frequency['cards']}
    chinese = {card['id']: card['chineseAudio'] for card in (chinese_index or {}).get('cards', [])}
    result, seen_words, seen_ids = [], set(), set()
    for note in notes:
        source = html.unescape(re.sub(r'<[^>]*>', '', note.get('Source', ''))).strip()
        if not source.startswith('Chapter'):
            continue
        chapters = list(dict.fromkeys(int(chapter) for chapter in re.findall(r'Chapter\s*(\d+)', source)))
        if not chapters or any(chapter not in CHAPTERS for chapter in chapters):
            raise ValueError(f'Unexpected source chapters for note {note["id"]}: {source}')
        word = normalize_word(note['Word'])
        if not word or word in seen_words or note['id'] in seen_ids:
            raise ValueError(f'Duplicate or empty network word/id: {word}')
        if word in frequent:
            raise ValueError(f'High-frequency overlap: {word}')
        candidates = references.get(word, [])
        if not candidates:
            raise ValueError(f'Missing Wanglu reference: {word}')
        primary = chapters[0]
        matching = [card for card in candidates if card['chapter'] == primary]
        if not matching:
            raise ValueError(f'Missing chapter {primary} reference: {word}')
        original = matching[0]
        _audio_file(public_root, original['audio'])
        if not original.get('chinese') or not original.get('answers'):
            raise ValueError(f'Incomplete canonical reference: {word}')
        card = dict(original, id=f'network-{note["id"]}', chapter=primary, chapters=chapters,
                    sourceBook='network', sourceLabel=f'网络雅思 · 第 {primary} 章')
        if chinese_index is not None:
            if original['id'] not in chinese:
                raise ValueError(f'Missing Chinese index reference: {original["id"]}')
            card['chineseAudio'] = chinese[original['id']]
            _audio_file(public_root, card['chineseAudio'])
        result.append(card)
        seen_words.add(word)
        seen_ids.add(note['id'])
    result.sort(key=lambda card: card['chapter'])
    return dict(version='2026-10-07-network-v1', source='Sword20 unique network entries excluding high-frequency corpus',
                sourceBook='network', chineseVoice=wanglu.get('chineseVoice', {}), cards=result, tracks=[])


def spoken_chinese(text):
    text = re.sub(r'(?<![A-Za-z])(?:adj|adv|prep|pron|conj|num|art|int|aux|phr|vt|vi|n|v)\s*[.．]?\s*/', '，', text)
    return re.sub(r'\s*，\s*', '，', text).strip('， /')


def build_chinese_index(books, cache_dir, output_dir):
    """Preflight all cached text before publishing content-addressed copies."""
    prepared, audio_by_text, seen_ids = [], {}, set()
    for source_book, book in books:
        if source_book not in ('wanglu', 'frequency'):
            raise ValueError(f'Unknown Chinese index source: {source_book}')
        for original in book['cards']:
            if original['id'] in seen_ids:
                raise ValueError(f'Duplicate Chinese index id: {original["id"]}')
            seen_ids.add(original['id'])
            text = spoken_chinese(original['chinese'])
            if not text:
                raise ValueError(f'Empty Chinese definition: {original["id"]}')
            if text not in audio_by_text:
                signature = json.dumps([RESOURCE, SPEAKER, INSTRUCTION, text], ensure_ascii=False).encode()
                cached = Path(cache_dir, hashlib.sha256(signature).hexdigest()[:24] + '.mp3')
                if not cached.is_file() or not cached.stat().st_size:
                    raise ValueError(f'Missing cached Chinese audio for {original["id"]}')
                digest = file_sha256(cached)
                audio_by_text[text] = (cached, digest)
            cached, digest = audio_by_text[text]
            label = f'王陆雅思 · 第 {original["chapter"]} 章' if source_book == 'wanglu' else f'雅思高频 · Unit {original["chapter"]}'
            card = dict(original, sourceBook=source_book, sourceLabel=label,
                        chineseAudio=f'/data/audio/ielts-zh/{digest[:24]}.mp3')
            prepared.append(card)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    published = {}
    for cached, digest in audio_by_text.values():
        filename = digest[:24] + '.mp3'
        if filename in published and published[filename] != digest:
            raise ValueError('Chinese audio content hash collision')
        target = output_dir / filename
        if target.exists():
            if file_sha256(target) != digest:
                raise ValueError(f'Existing Chinese audio content mismatch: {filename}')
        else:
            shutil.copyfile(cached, target)
        published[filename] = digest
    return dict(version='2026-10-07-chinese-index-v1',
                chineseVoice=books[0][1].get('chineseVoice', {}), cards=prepared)


def chapter_counts(cards):
    return dict(sorted(Counter(card['chapter'] for card in cards).items()))


def file_sha256(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--cache', type=Path)
    args = parser.parse_args()
    data_dir = args.root / 'public/data'
    source_paths = [data_dir / 'ielts-corpus-v1.json', data_dir / 'ielts-high-frequency-v1.json']
    before = {path.name: file_sha256(path) for path in source_paths}
    wanglu, frequency = [json.loads(path.read_text(encoding='utf8')) for path in source_paths]
    notes = read_apkg_notes(args.source)
    network = build_network(notes, wanglu, frequency, args.root / 'public')
    expected = {3: 564, 4: 225, 5: 1443, 8: 359, 11: 1556}
    if len(notes) != 4853 or len(network['cards']) != 4147 or chapter_counts(network['cards']) != expected:
        raise ValueError('Source count or chapter distribution differs from approved import')
    output_dir = data_dir / 'audio/ielts-zh'
    chinese = build_chinese_index([('wanglu', wanglu), ('frequency', frequency)],
                                  args.cache or args.root / 'tools/.ielts-speech/doubao', output_dir)
    network = build_network(notes, wanglu, frequency, args.root / 'public', chinese)
    after = {path.name: file_sha256(path) for path in source_paths}
    if before != after:
        raise ValueError('Original corpus manifest changed during import')
    network_path, index_path = data_dir / 'ielts-network-v1.json', data_dir / 'ielts-chinese-audio-v1.json'
    write_json(network_path, network)
    write_json(index_path, chinese)
    clips = sorted({Path(card['chineseAudio']).name for card in chinese['cards']})
    report = dict(source=str(args.source), sourceSha256=file_sha256(args.source), sourceNotes=len(notes),
                  networkCards=len(network['cards']), excludedFrequencyOnlyNotes=len(notes)-len(network['cards']),
                  chapters=chapter_counts(network['cards']), originalManifestSha256=before,
                  originalsByteUnchanged=before == after, chineseIndexCards=len(chinese['cards']),
                  chineseUniqueClips=len(clips), chineseClipBytes=sum((output_dir / name).stat().st_size for name in clips),
                  chineseClipSha256={name: file_sha256(output_dir / name) for name in clips},
                  outputSha256={network_path.name: file_sha256(network_path), index_path.name: file_sha256(index_path)},
                  paidTtsCalls=0)
    write_json(args.root / 'docs/ielts-network-import.json', report)
    print(json.dumps({key: value for key, value in report.items() if key != 'chineseClipSha256'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
