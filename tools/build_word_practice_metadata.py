"""Build optional exact-word metadata without putting dictionaries/materials in Git.

Run with explicit local dictionary, MIT license, authorized cards/corpus JSON and
output paths. The JSON preserves the dictionary's license and provenance. It
never changes spelling answers, infers a translation or expands a substring.
"""
import argparse
import csv
import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


def normalize_word(value):
    return unicodedata.normalize('NFKC', value).replace('’', "'").strip().lower()


def candidate_words(data):
    result = set()
    for card in data.get('cards', []):
        for value in [card.get('word', ''), *card.get('answers', [])]:
            if isinstance(value, str) and value.strip():
                result.add(normalize_word(value))
        text = card.get('englishText', '')
        result.update(normalize_word(word) for word in re.findall(r"[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*", text))
        analysis = card.get('aiAnalysis') or {}
        for phrase in analysis.get('phrases', []):
            value = phrase.get('phrase', '')
            if isinstance(value, str) and value.strip():
                result.add(normalize_word(value))
    return result


def read_exact_metadata(dictionary, candidates):
    candidates = {normalize_word(value) for value in candidates}
    result = {}
    with Path(dictionary).open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        if not {'word', 'translation', 'phonetic', 'pos'}.issubset(reader.fieldnames or []):
            raise ValueError('Dictionary CSV lacks required exact metadata fields')
        for row in reader:
            word = normalize_word(row['word'])
            if word not in candidates or word in result:
                continue
            meaning = (row['translation'] or '').replace('\\n', '\n').strip()
            if not meaning:
                continue
            record = {'meaning': meaning}
            if row['phonetic'].strip():
                record['ipa'] = row['phonetic'].strip()
            if row['pos'].strip():
                record['partOfSpeech'] = row['pos'].strip()
            result[word] = record
    return dict(sorted(result.items()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dictionary', type=Path, required=True)
    parser.add_argument('--license', type=Path, required=True)
    parser.add_argument('--input', type=Path, action='append', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    license_text = args.license.read_text(encoding='utf-8').strip()
    if 'MIT License' not in license_text or 'Permission is hereby granted' not in license_text:
        raise ValueError('Expected verified ECDICT MIT license text')
    candidates = set()
    for path in args.input:
        candidates.update(candidate_words(json.loads(path.read_text(encoding='utf-8-sig'))))
    words = read_exact_metadata(args.dictionary, candidates)
    artifact = {
        'version': 'word-practice-metadata-v1', 'source': 'ECDICT',
        'sourceUrl': 'https://github.com/skywind3000/ECDICT', 'license': license_text,
        'dictionarySha256': hashlib.sha256(args.dictionary.read_bytes()).hexdigest(),
        'generatedAt': datetime.now(timezone.utc).isoformat(), 'words': words,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Exact dictionary metadata: {len(words)}/{len(candidates)} candidates; {args.output.stat().st_size} bytes')


if __name__ == '__main__':
    main()