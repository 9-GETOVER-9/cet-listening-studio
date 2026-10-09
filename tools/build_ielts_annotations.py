"""Import only per-word notes and flags; never publish answer statistics."""
import argparse
import csv
import hashlib
import html
import json
import re
from collections import Counter
from pathlib import Path


FLAGS = {
    '认识，但没听出来': 'pronunciation',
    '发音和自己想的不一样': 'pronunciation',
    '连读、弱读没听出来': 'pronunciation',
    '听出来了，但拼写错': 'spelling',
    '单复数错': 'spelling',
    '完全不认识': 'both',
    '听的时候走神': None,
}


def plain(value):
    value = re.sub(r'<br\s*/?>', '\n', str(value or ''), flags=re.I)
    value = re.sub(r'<[^>]*>', '', value)
    return html.unescape(value).strip()


def extract_note(row, original):
    definition, original = plain(row.get('释义')), plain(original)
    parts = []
    if definition and definition != original:
        extra = definition[len(original):].strip() if original and definition.startswith(original) else '补充释义：' + definition
        if extra:
            parts.append(extra)
    source = re.search(r'(?:Source|来源)\s*[：:]\s*Unit\s*\d+\s*#\s*\d+\s*(.*)$', plain(row.get('笔记内容')), re.S | re.I)
    if source:
        extra = source.group(1).strip('；; \n')
        if extra and not any(extra in part for part in parts):
            parts.append(extra)
    return '\n\n'.join(parts)


def build_annotations(rows, cards):
    corpus = {card['id']: card for card in cards}
    seen, annotations = set(), []
    for row in rows:
        identifier = str(row.get('笔记 ID', '')).strip()
        match = re.fullmatch(r'(?:="(\d+)"|(\d+))', identifier)
        if not match:
            raise ValueError('Invalid inert note identifier: ' + identifier)
        card_id = 'ielts-hf-' + (match.group(1) or match.group(2))
        if card_id in seen:
            raise ValueError('Duplicate note identifier: ' + card_id)
        seen.add(card_id)
        card = corpus.get(card_id)
        if card is None or plain(row.get('词条')) != card['word'] or row.get('Unit') != f"Unit{card['chapter']}::{card['section']}":
            raise ValueError('Card identity mismatch: ' + card_id)
        flag = plain(row.get('旗帜名称'))
        if flag and flag not in FLAGS:
            raise ValueError('Unknown source flag: ' + flag)
        note = extract_note(row, card.get('chinese', ''))
        if len(note) > 10000:
            raise ValueError('Note exceeds supported length: ' + card_id)
        if note or flag:
            annotations.append(dict(cardId=card_id, note=note, reason=FLAGS.get(flag), sourceFlag=flag))
    return dict(version='ielts-frequency-annotations-v1', cards=annotations)


def main():
    parser = argparse.ArgumentParser()
    for key in ('csv', 'corpus', 'output', 'report'):
        parser.add_argument('--' + key, required=True)
    args = parser.parse_args()
    source = Path(args.csv)
    with source.open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream))
    corpus = json.loads(Path(args.corpus).read_text(encoding='utf-8-sig'))
    result = build_annotations(rows, corpus['cards'])
    report = dict(sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), matchedRows=len(rows),
                  importedCards=len(result['cards']), notes=sum(bool(c['note']) for c in result['cards']),
                  flags=sum(bool(c['sourceFlag']) for c in result['cards']),
                  reasons=dict(Counter(c['reason'] or 'unlabelled' for c in result['cards'] if c['sourceFlag'])))
    for filename, value in ((args.output, result), (args.report, report)):
        path = Path(filename)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
