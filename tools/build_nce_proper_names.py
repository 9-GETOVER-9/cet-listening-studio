"""Build position-specific NCE person/place seeds from an explicitly reviewed alias input.

This tool does not infer names from capitalization. It preserves original English
SHA-256 and emits JavaScript UTF-16 offsets. The source cards, reviewed aliases,
and generated index remain local/deployment data, outside Git.
"""
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path


def utf16_offset(text, index):
    return len(text[:index].encode('utf-16-le')) // 2


def build_name_index(cards, names):
    aliases = []
    for field, kind in [('people', 'person'), ('places', 'place')]:
        for value in names.get(field, []):
            if not isinstance(value, str) or not value.strip():
                raise ValueError('Reviewed aliases must contain nonempty strings')
            aliases.append((value.strip(), kind))
    aliases = sorted(set(aliases), key=lambda item: (-len(item[0]), item[0], item[1]))
    result = {}
    for card in cards:
        if card.get('level') != 'NCE' or card.get('isTitle') or card.get('isMerged'):
            continue
        text = card.get('englishText', '')
        card_id = card.get('cardId')
        if not isinstance(text, str) or not isinstance(card_id, str) or not text.strip():
            continue
        selected = []
        for alias, kind in aliases:
            for match in re.finditer(r'(?<!\w)' + re.escape(alias) + r'(?!\w)', text):
                start, end = match.span()
                # Possessive suffix belongs to the same original name token; partial
                # token spans would fail the consumer's whole-word validation.
                if re.match(r"['’]s(?!\w)", text[end:]):
                    end += 2
                if any(start < used_end and end > used_start for used_start, used_end, _ in selected):
                    continue
                selected.append((start, end, kind))
        if selected:
            result[card_id] = {
                'textHash': hashlib.sha256(text.encode('utf-8')).hexdigest(),
                'spans': [{'start': utf16_offset(text, start), 'end': utf16_offset(text, end), 'kind': kind}
                          for start, end, kind in sorted(selected)],
            }
    return dict(sorted(result.items()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cards', type=Path, required=True)
    parser.add_argument('--names', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    cards = json.loads(args.cards.read_text(encoding='utf-8-sig'))
    names = json.loads(args.names.read_text(encoding='utf-8-sig'))
    entries = build_name_index(cards['cards'], names)
    artifact = {
        'version': 'nce-proper-names-v1',
        'source': 'Reviewed explicit person/place aliases; original NCE sentence positions',
        'cardsSha256': hashlib.sha256(args.cards.read_bytes()).hexdigest(),
        'namesSha256': hashlib.sha256(args.names.read_bytes()).hexdigest(),
        'generatedAt': datetime.now(timezone.utc).isoformat(), 'cards': entries,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Proper-name seeds: {len(entries)} cards, {sum(len(row["spans"]) for row in entries.values())} spans; {args.output.stat().st_size} bytes')


if __name__ == '__main__':
    main()