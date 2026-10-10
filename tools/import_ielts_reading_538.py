"""Import chapter 1 only; retain source provenance and explicit audit limits.

Run with --source CSV --markdown MD --pdf PDF. Source files are read-only.
Only commas/semicolons separate expressions; phrases remain intact.
"""
import argparse
from collections import Counter
import csv
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import unicodedata


VERSION = 'ielts-reading-538-v1'
TITLE = '雅思阅读538 · 第一章考点词'
STATUSES = {'已对照原书': 'verified', '自动提取': 'extracted', '待核对': 'pending'}
RELATIONS = {'that': 'reference', 'and': 'parallel', 'rather than': 'contrast', 'thanks to': 'cause'}
# PDF p23 / printed p10 visibly reads fulfill, not OCR's fulfll.
WORD_REPAIRS = {(3, 'fulfll'): 'fulfill'}
AUDITED_SOURCE_SHA256 = {
    'csv': 'fc2004a1464ce79a0111e594ef636f75e48a553d1e594abdda6dbb1b8c934807',
    'markdown': 'f15330085c2976912c6911e975daa256bcf20d92a592a81fcad518270f6bfd91',
    'pdf': '82eaf2c23b9dc26ec147dd14e21c1bb68981356560c7a649c59d840d8c1b0766',
}


def clean(value):
    return ' '.join(unicodedata.normalize('NFKC', value).split())


def normalize(value):
    return clean(value).casefold()


def stable_id(prefix, value):
    return prefix + hashlib.sha256(value.encode('utf-8')).hexdigest()[:20]


def expressions(value):
    value = re.sub(r'\*\s*(?:指代|并列结构|转折结构|因果关系)[^,;，；]*$', '', value)
    value = re.sub(r'[（(](?:指代关系|并列结构|转折结构|因果关系)[）)]', '', value)
    return [clean(part) for part in re.split(r'[,;，；]', value) if clean(part)]


def build_cards(rows, *, source_audited=False):
    cards, seen = [], set()
    for index, row in enumerate(rows):
        category = int(row['类别'])
        if category not in (1, 2, 3):
            raise ValueError(f'Invalid category at source row {index + 2}')
        source_word = clean(row['考点词']).rstrip('*').strip()
        repair_eligible = source_audited and row['核对状态'] == '自动提取'
        word = WORD_REPAIRS.get((category, normalize(source_word)), source_word) if repair_eligible else source_word
        identity = f'{category}|{normalize(word)}'
        if identity in seen:
            raise ValueError(f'Duplicate normalized card identity: {identity}')
        seen.add(identity)
        if row['核对状态'] not in STATUSES:
            raise ValueError(f'Unknown source status at row {index + 2}')
        status = STATUSES[row['核对状态']]
        if repair_eligible and (category, normalize(source_word)) in WORD_REPAIRS:
            status = 'verified'
        values = expressions(row['真题考点对应'])
        if not values or not word or not clean(row['常考中文词义']):
            raise ValueError(f'Missing word, meaning, or expression at row {index + 2}')
        if len({normalize(value) for value in values}) != len(values):
            raise ValueError(f'Duplicate normalized expression at source row {index + 2}')
        card_id = stable_id('reading538-', identity)
        relation = RELATIONS.get(normalize(word), 'lexical')
        if normalize(word) == 'fertiliser':
            relation = 'context'
        cards.append({'id': card_id, 'category': category, 'order': index + 1,
                      'sourceRow': index + 2, 'word': word, 'meaning': clean(row['常考中文词义']),
                      'relation': relation, 'status': status,
                      'expressions': [{'id': stable_id('reading538-expression-', card_id + '|' + normalize(value)),
                                       'text': value} for value in values]})
    return cards


def audit_markdown(rows, markdown):
    """Compare CSV to ordinary first-chapter OCR cells, not semantic truth."""
    from bs4 import BeautifulSoup
    text = markdown.read_text(encoding='utf-8')
    start = text.index('## 雅思阅读538考点词')
    end = text.index('## 最后重申', start)
    chapter = text[start:end]
    tables = BeautifulSoup(chapter, 'html.parser').find_all('table')
    if len(tables) != 4:
        raise ValueError(f'Expected four first-chapter tables, found {len(tables)}')
    source = {}
    for table in tables:
        for tr in table.find_all('tr')[1:]:
            cells = [td.get_text(' ', strip=True) for td in tr.find_all('td', recursive=False)]
            cells = [value for value in cells if value]
            if len(cells) == 3 and '*' not in cells[0]:
                source[cells[0]] = cells[1:]
    identical, differences, structural = [], [], []
    for index, row in enumerate(rows):
        word, source_row = row['考点词'], index + 2
        if word not in source:
            structural.append({'sourceRow': source_row, 'word': word})
            continue
        diff = {key: {'csv': row[key], 'ocr': source[word][i]}
                for i, key in enumerate(('常考中文词义', '真题考点对应')) if row[key] != source[word][i]}
        if diff:
            differences.append({'sourceRow': source_row, 'word': word, 'fields': diff})
        else:
            identical.append(source_row)
    return {'tables': 4, 'htmlTablePhysicalRows': [len(t.find_all('tr')) for t in tables],
            'ordinaryRowsParsed': len(source), 'identicalCsvOcrRows': len(identical),
            'identicalSourceRows': identical, 'csvOcrDifferences': differences,
            'rowsNeedingStructuralRecovery': structural,
            'bookCountDeclarationsPresent': all(value in chapter for value in ('20+34=54', '100+71=171', '256+57=313'))}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def import_corpus(source, markdown, pdf, output, report_path):
    # Read every input before touching existing output, including image-only PDF.
    fingerprints = {key: sha256(path) for key, path in
                    (('csv', source), ('markdown', markdown), ('pdf', pdf))}
    source_audited = fingerprints == AUDITED_SOURCE_SHA256
    with source.open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.DictReader(handle))
    cards = build_cards(rows, source_audited=source_audited)
    counts = Counter(card['category'] for card in cards)
    if dict(counts) != {1: 20, 2: 100, 3: 256}:
        raise ValueError(f'Chapter 1 category counts do not match: {dict(counts)}')
    md_audit = audit_markdown(rows, markdown)
    dataset = {'version': VERSION, 'title': TITLE, 'cards': cards}
    dataset_bytes = (json.dumps(dataset, ensure_ascii=False, indent=2) + '\n').replace('\n', os.linesep).encode('utf-8')
    report = {
        'version': VERSION, 'scope': 'First chapter only: PDF pages 14–29, printed pages 1–16.',
        'source': {'csv': str(source), 'csvSha256': fingerprints['csv'],
                   'markdown': str(markdown), 'markdownSha256': fingerprints['markdown'],
                   'pdf': str(pdf), 'pdfSha256': fingerprints['pdf']},
        'dataset': {'path': str(output), 'sha256': hashlib.sha256(dataset_bytes).hexdigest(), 'cards': len(cards),
                    'categoryCounts': dict(counts), 'statusCounts': dict(Counter(c['status'] for c in cards)),
                    'expressions': sum(len(c['expressions']) for c in cards),
                    'sourceStatusCounts': dict(Counter(r['核对状态'] for r in rows)),
                    'bookCounts': {'1': 54, '2': 171, '3': 313, 'total': 538},
                    'bookCountNote': '538 counts main terms plus highlighted related terms, with cross-group duplication rules; dataset has 376 main groups. Expression count is a separate metric.'},
        'markdownAudit': md_audit,
        'checks': ['All 376 CSV rows imported in source order; category counts 20/100/256.',
                   'Every card and expression ID hashes normalized content, never row position.',
                   'All expression cells retained; comma/semicolon delimiters normalized without splitting internal phrases.',
                   'Four starred structural groups retained as relation metadata; Chinese explanatory footnote removed from answers.',
                   'CSV compared against all four first-chapter OCR HTML tables; matches show transcription agreement only.',
                   'Original image-only PDF contact sheet used to locate chapter boundaries; focused full-page image inspection confirmed the issues listed below.'],
        'pdfVisualChecks': [
            {'pdfPage': 14, 'printedPage': 1, 'words': ['resemble'], 'finding': 'PDF v. confirms CSV correction from OCR y.; printed category count 20+34=54.', 'image': 'ielts-reading-538-page-14.png'},
            {'pdfPage': 15, 'printedPage': 2, 'words': ['fertiliser', 'that*', 'and*', 'rather than*', 'thanks to*'],
             'finding': 'Confirms all four structurally merged OCR groups and their full expression lists/relations; fertiliser row actually prints chemical, toxic, unnatural; category 2 count 100+71=171.', 'image': 'ielts-reading-538-page-15.png'},
            {'pdfPage': 17, 'printedPage': 4, 'words': ['accelerate', 'principle', 'potential'],
             'finding': 'Confirms speed up belongs wholly to accelerate; rule belongs to principle; possibility belongs to potential. CSV had already repaired these OCR column/row merges.', 'image': 'ielts-reading-538-page-17.png'},
            {'pdfPage': 23, 'printedPage': 10, 'words': ['fulfill'],
             'finding': 'PDF reads fulfill; CSV and Markdown read fulfll. Dataset repairs spelling to fulfill and marks this row verified.', 'image': 'ielts-reading-538-page-23.png'}],
        'repairs': [{'sourceRow': 224, 'field': 'word', 'from': 'fulfll', 'to': 'fulfill',
                     'basis': 'Original PDF page 23 / printed page 10, visually inspected.', 'status': 'verified'}],
        'structuralRelations': RELATIONS,
        'unresolvedIssues': [
            {'word': 'fertiliser', 'sourceRow': 17, 'status': 'pending', 'relation': 'context',
             'issue': 'Source text verified on PDF p15, but chemical/toxic/unnatural are source context associations, not interchangeable dictionary synonyms. Pending preserved for exclusion from grading.'},
            {'issue': '366 extracted rows remain OCR-derived and have not each received full original-page transcription and semantic review; CSV/OCR agreement is not full verification.',
             'scope': 'All rows with dataset status extracted.'},
            {'issue': 'Some source mappings rely on test context or differing parts of speech (e.g. equator → geography, patient → repetitive, interference → interdependence). Retained faithfully without inventing corrections; lexical is a content grouping, not a guarantee of dictionary equivalence.'}],
        'verificationPolicy': 'verified denotes source/transcription confirmation only, not universal synonym equivalence; extracted is not fully audited; pending remains browseable and must be excluded from scored prompts.',
        'idPolicy': 'SHA-256 first 20 hex digits: normalized category|word; expression IDs hash card ID|normalized expression. Case and whitespace normalization; sourceRow/order never enter IDs.',
        'visualAuditCoverage': {'chapterPdfPages': list(range(14, 30)), 'contactSheet': 'ielts-reading-538-pdf-contact.png',
                                'focusedPdfPages': [14, 15, 17, 23], 'focusedCardRows': [2, 17, 18, 19, 20, 21, 50, 72, 73, 224],
                                'allRowsSemanticallyVerified': False},
    }
    report['visualAuditCoverage']['sourceFingerprintsMatch'] = source_audited
    report['visualAuditCoverage']['auditedSourceSha256'] = AUDITED_SOURCE_SHA256
    if not source_audited:
        report['scope'] = 'First-chapter CSV groups only; PDF page boundaries have not been visually audited for these inputs.'
        report['pdfVisualChecks'] = []
        report['repairs'] = []
        report['checks'][-1] = 'Input fingerprints differ from the visually audited source set; no prior PDF visual findings or verified spelling repairs applied.'
        report['checks'][3] = 'Known structural relation markers are mapped to relation metadata when present; explanatory relation footnotes are removed from answer text.'
        report['visualAuditCoverage'].update(chapterPdfPages=[], contactSheet=None, focusedPdfPages=[], focusedCardRows=[])
        report['unresolvedIssues'] = [{'issue': 'These input fingerprints have not received original-page visual review. Source statuses are retained without promoting any row to verified; pending rows remain pending.'}]
        report['verificationPolicy'] = 'Source status labels are carried as CSV provenance and have not been independently visually confirmed for these inputs. No prior visual-audit assertions or verified spelling repairs apply; pending remains browseable and must be excluded from scored prompts.'
    report_bytes = (json.dumps(report, ensure_ascii=False, indent=2) + '\n').replace('\n', os.linesep).encode('utf-8')
    staged = []
    try:
        # Both artifacts must be fully serialized and staged before publication.
        for target, payload in ((output, dataset_bytes), (report_path, report_bytes)):
            target.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=target.parent, prefix=target.name + '.', suffix='.tmp', delete=False) as handle:
                staged.append((Path(handle.name), target))
                handle.write(payload)
        for temporary, target in staged:
            os.replace(temporary, target)
    finally:
        for temporary, _ in staged:
            temporary.unlink(missing_ok=True)
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--markdown', required=True, type=Path)
    parser.add_argument('--pdf', required=True, type=Path)
    parser.add_argument('--output', type=Path, default=Path('public/data/ielts-reading-538-v1.json'))
    parser.add_argument('--report', type=Path, default=Path('docs/ielts-reading-538-import.json'))
    args = parser.parse_args()
    report = import_corpus(args.source, args.markdown, args.pdf, args.output, args.report)
    print(json.dumps(report['dataset'], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
