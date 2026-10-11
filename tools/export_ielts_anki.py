"""Export the existing chapter-one IELTS corpus to local, media-free Anki packages."""
import argparse
from collections import Counter
from contextlib import closing
import copy
import hashlib
import html
import itertools
import json
from pathlib import Path
import re
import sqlite3
import tempfile
import time
import unicodedata
import zipfile

import genanki


NAMESPACE = 'ielts-reading-538-chapter1-full-v1'
MODEL_ID = 1785369201
ROOT_DECK_ID = 1785369210
CATEGORY_DECK_IDS = {1: 1785369211, 2: 1785369212, 3: 1785369213}
PENDING_DECK_IDS = {1: 1785369221, 2: 1785369222, 3: 1785369223}
ROOT_NAME = 'IELTS538::第一章'
NUMERALS = {1: '一', 2: '二', 3: '三'}
RELATIONS = {'lexical': '词语对应', 'reference': '指代', 'parallel': '并列',
             'contrast': '转折', 'cause': '因果', 'context': '语境'}
STATUSES = {'verified', 'extracted', 'pending'}
FIELD_NAMES = ['Word', 'Meaning', 'Category', 'Prompt', 'FrontContent', 'AnswerHtml',
               'Relation', 'SourceId', 'Status', 'SourceRow', 'ReviewHelp', 'ChoiceEnabled']
TEMPLATE_DIR = Path(__file__).with_name('anki_templates')


def normalized(text):
    return ' '.join(unicodedata.normalize('NFKC', text).split()).casefold()


def validate_corpus(data):
    """Reject ambiguous identities/schema before any export files are written."""
    if not isinstance(data, dict) or not isinstance(data.get('cards'), list) or not data['cards']:
        raise ValueError('Source must contain a nonempty cards list')
    result = copy.deepcopy(data)
    ids, expression_ids = set(), set()

    def text(value, field, allow_empty=False):
        if not isinstance(value, str) or (not allow_empty and not value.strip()):
            raise ValueError(field + ' must be a nonempty string')
        if any(ord(char) < 32 and char not in '\t\n\r' for char in value):
            raise ValueError(field + ' contains a forbidden control character')

    for card in result['cards']:
        if not isinstance(card, dict): raise ValueError('Every card must be an object')
        for key in ['id', 'word', 'meaning', 'relation', 'status']:
            text(card.get(key), key)
        if card['id'] in ids: raise ValueError('Duplicate source ID: ' + card['id'])
        ids.add(card['id'])
        if type(card.get('category')) is not int or card['category'] not in NUMERALS:
            raise ValueError('category must be 1, 2 or 3')
        for key in ['order', 'sourceRow']:
            if type(card.get(key)) is not int or card[key] < 1:
                raise ValueError(key + ' must be a positive integer')
        if card['relation'] not in RELATIONS: raise ValueError('Unknown relation: ' + card['relation'])
        if card['status'] not in STATUSES: raise ValueError('Unknown status: ' + card['status'])
        expressions = card.get('expressions')
        if not isinstance(expressions, list) or not expressions:
            raise ValueError('Every card must preserve at least one source expression')
        for expression in expressions:
            if not isinstance(expression, dict): raise ValueError('Expression must be an object')
            text(expression.get('id'), 'expression id')
            text(expression.get('text'), 'expression text')
            if expression['id'] in expression_ids: raise ValueError('Duplicate expression ID: ' + expression['id'])
            expression_ids.add(expression['id'])
    return result


def build_entries(corpus):
    """Keep all source answers; deduplicate only displayed choice equivalents."""
    cards = corpus['cards']
    pool = {}
    for card in cards:
        if card['status'] == 'pending': continue
        for expression in card['expressions']:
            key = normalized(expression['text'])
            pool.setdefault(key, ' '.join(expression['text'].split()))
    entries = []
    for card in cards:
        entry = copy.deepcopy(card)
        label = RELATIONS[card['relation']]
        entry['prompt'] = '哪些是书中列出的%s对应表达？选出所有符合的选项。' % label
        entry['guid'] = genanki.guid_for(NAMESPACE, card['id'])
        entry['choices'] = []
        if card['status'] == 'pending':
            entry['prompt'] = '书中列出的%s资料待核对，本卡只作参考，不进行答案判断。' % label
        else:
            correct = {}
            for expression in card['expressions']:
                correct.setdefault(normalized(expression['text']), ' '.join(expression['text'].split()))
            excluded = set(correct) | {normalized(card['word'])}
            candidates = [key for key in pool if key not in excluded]
            candidates.sort(key=lambda key: hashlib.sha256((NAMESPACE + card['id'] + '\0' + key).encode('utf-8')).digest())
            if len(candidates) < 2:
                raise ValueError('Not enough distinct nonpending distractors for ' + card['id'])
            entry['choices'] = [dict(text=value, correct=True) for value in correct.values()]
            entry['choices'] += [dict(text=pool[key], correct=False) for key in candidates[:2]]
            entry['choices'].sort(key=lambda choice: hashlib.sha256((card['id'] + '\0' + normalized(choice['text'])).encode('utf-8')).digest())
        entries.append(entry)
    return entries


def load_templates():
    templates = {name: (TEMPLATE_DIR / filename).read_text(encoding='utf-8')
            for name, filename in [('front', 'front.html'), ('back', 'back.html'),
                                   ('css', 'style.css'), ('js', 'choices.js')]}
    templates['front'] = templates['front'].replace('/* CHOICES_JS */', templates['js'])
    return templates


def entry_fields(entry, templates=None):
    escape = html.escape
    pending = entry['status'] == 'pending'
    if pending:
        content = '<div class="pending"><strong>资料待核对</strong><br>默认暂停，保留原书资料；请核实语境后再决定是否恢复学习。使用 Anki“显示答案”查看原始列表。</div>'
        answers = '<div class="pending"><strong>资料待核对 · 原始列表</strong><br>以下表达尚未确认对应关系，不标为正确答案。</div>'
        help_html = '<p class="hint">本卡默认暂停，位于所属类别的“资料待核对”子牌组。</p>'
    else:
        options = ''.join('<label class="choice" data-correct="%s"><input type="checkbox"><span class="choice-word">%s</span><span class="choice-state"></span></label>'
                          % ('yes' if choice['correct'] else 'no', escape(choice['text'])) for choice in entry['choices'])
        content = '<div class="choice-list">' + options + '</div><p class="result" role="status" aria-live="polite"></p><div class="actions"><button class="primary" data-check type="button">核对选择</button><button class="secondary" data-reset type="button" hidden>再练一次</button></div><p class="hint">核对后用 Anki“显示答案”，再按实际记忆评分。干扰项只用于区分书中列出的对应，不判断词语在所有语境中的关系。</p>'
        answers = ''
        help_html = '<div class="review-help"><strong>使用 Anki 原生评分安排复习</strong><br>漏选或错选：可以选择“重来”。回忆有难度：按实际记忆选择“困难”或“良好”。完整轻松回忆：选择“良好”或“简单”。模板不会自动评分或修改复习间隔。</div>'
    answers += '<ul class="answer-list">' + ''.join('<li>' + escape(expression['text']) + '</li>' for expression in entry['expressions']) + '</ul>'
    return dict(Word=escape(entry['word']), Meaning=escape(entry['meaning']), Category=str(entry['category']),
                Prompt=escape(entry['prompt']), FrontContent=content, AnswerHtml=answers,
                Relation=escape(RELATIONS[entry['relation']] + ' (' + entry['relation'] + ')'),
                SourceId=escape(entry['id']), Status=escape(entry['status']), SourceRow=str(entry['sourceRow']), ReviewHelp=help_html,
                ChoiceEnabled='' if pending else 'yes')


def render_entry(entry, templates=None):
    templates = templates or load_templates()
    fields = entry_fields(entry, templates)
    def render(template):
        template = re.sub(r'\{\{#(\w+)\}\}([\s\S]*?)\{\{/\1\}\}', lambda match: match.group(2) if fields[match.group(1)] else '', template)
        return re.sub(r'\{\{(\w+)\}\}', lambda match: fields[match.group(1)], template)
    return render(templates['front']), render(templates['back'])


def validate_package(path, expected_entries):
    """Read the generated SQLite package, closing it explicitly on Windows."""
    with tempfile.TemporaryDirectory() as directory:
        with zipfile.ZipFile(path) as archive:
            if set(archive.namelist()) != {'collection.anki2', 'media'} or json.loads(archive.read('media')) != {}:
                raise ValueError('Package must contain no media')
            database = Path(directory) / 'collection.anki2'
            database.write_bytes(archive.read('collection.anki2'))
        with closing(sqlite3.connect(database)) as connection:
            if connection.execute('pragma integrity_check').fetchone()[0] != 'ok': raise ValueError('Invalid SQLite database')
            rows = connection.execute('select n.guid, n.mid, c.ord, c.queue, c.did from notes n join cards c on c.nid=n.id').fetchall()
            note_count = connection.execute('select count(*) from notes').fetchone()[0]
            card_count = connection.execute('select count(*) from cards').fetchone()[0]
            models, decks = (json.loads(value) for value in connection.execute('select models, decks from col').fetchone())
        expected = {entry['guid']: entry for entry in expected_entries}
        if note_count != len(expected) or card_count != len(expected) or len(rows) != len(expected): raise ValueError('Package count mismatch')
        if {row[0] for row in rows} != set(expected): raise ValueError('Package GUID mismatch')
        for guid, model_id, ordinal, queue, deck_id in rows:
            entry = expected[guid]
            pending = entry['status'] == 'pending'
            expected_deck = (PENDING_DECK_IDS if pending else CATEGORY_DECK_IDS)[entry['category']]
            if model_id != MODEL_ID or ordinal != 0 or queue != (-1 if pending else 0) or deck_id != expected_deck:
                raise ValueError('Package model, suspension or deck mismatch')
            if str(deck_id) not in decks: raise ValueError('Missing deck')
        if set(models) != ({str(MODEL_ID)} if expected else set()): raise ValueError('Unexpected model')
        return dict(notes=note_count, cards=card_count, suspended_cards=sum(row[3] == -1 for row in rows), media_files=0)


def write_package(package, path):
    """Build media-free packages with owned, automatically cleaned temporary SQLite."""
    if package.media_files:
        raise ValueError('IELTS packages must not contain media')
    with tempfile.TemporaryDirectory() as directory:
        database = Path(directory) / 'collection.anki2'
        timestamp = time.time()
        id_gen = itertools.count(int(timestamp * 1000))
        with closing(sqlite3.connect(database)) as connection:
            with closing(connection.cursor()) as cursor:
                package.write_to_db(cursor, timestamp, id_gen)
            connection.commit()
        # Windows requires the SQLite connection to close before ZIP and cleanup.
        with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            archive.write(database, 'collection.anki2')
            archive.writestr('media', '{}')


def preview_html(entries, packages, templates):
    downloads = ''.join('<a download href="%s">%s</a>' % (html.escape(package['filename']), html.escape(package['filename'])) for package in packages)
    options = ''.join('<option value="%s">第%s类 · %s · %s</option>' % (index, entry['category'], html.escape(entry['word']), html.escape(entry['status'])) for index, entry in enumerate(entries))
    articles = []
    for index, entry in enumerate(entries):
        front, back = render_entry(entry, templates)
        articles.append('<article class="preview-entry" data-entry="%s"%s>%s<details><summary>查看完整背面 · %s</summary>%s</details></article>'
                        % (index, ' hidden' if index else '', front, html.escape(entry['id']), back))
    js = """(function(){var select=document.querySelector('.entry-select'),entries=document.querySelectorAll('.preview-entry');select.onchange=function(){for(var i=0;i<entries.length;i++)entries[i].hidden=entries[i].getAttribute('data-entry')!==select.value;};})();"""
    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IELTS538 · 第一章完整牌组</title><style>' + templates['css'] + '</style></head><body><main class="page"><h1>IELTS538 · 第一章完整牌组</h1><p>按当前本地资料完整导出，共 %s 个词组。书名 538 统计主词与相关表达，并不代表 538 个独立词组。</p><p>多选仅核对书中列出的对应。资料待核对条目默认暂停，不计为正常练习。</p><nav class="downloads" aria-label="下载牌组">%s</nav><label for="entry-selector">浏览全部词条</label><select id="entry-selector" class="entry-select" aria-label="选择词条">%s</select>%s<noscript><style>.preview-entry[hidden]{display:block!important}</style><p>脚本不可用时展示全部词条，请先心中作答再展开完整背面。</p></noscript></main><script>%s</script></body></html>' % (len(entries), downloads, options, ''.join(articles), js)


def export_corpus(source: Path, output: Path):
    """Validate then generate four APKGs, a browsable preview and audited manifest."""
    source, output = Path(source), Path(output)
    raw = source.read_bytes()
    try: data = json.loads(raw.decode('utf-8-sig'))
    except (ValueError, UnicodeError) as error: raise ValueError('Source is not valid UTF-8 JSON') from error
    corpus = validate_corpus(data)
    entries = build_entries(corpus)
    templates = load_templates()
    model = genanki.Model(MODEL_ID, 'IELTS538 第一章完整对应 v1',
                          fields=[dict(name=name) for name in FIELD_NAMES],
                          templates=[dict(name='书中对应 · 多选', qfmt=templates['front'], afmt=templates['back'])], css=templates['css'])
    decks = {category: genanki.Deck(deck_id, ROOT_NAME + '::第' + NUMERALS[category] + '类') for category, deck_id in CATEGORY_DECK_IDS.items()}
    pending_decks = {}
    for entry in entries:
        fields = entry_fields(entry, templates)
        note = genanki.Note(model=model, fields=[fields[name] for name in FIELD_NAMES], guid=entry['guid'],
                            due=entry['order'], tags=['IELTS538', 'chapter1', 'category_' + str(entry['category']), entry['relation'], entry['status']])
        if entry['status'] == 'pending':
            note.cards[0].suspend = True
            category = entry['category']
            pending_decks.setdefault(category, genanki.Deck(PENDING_DECK_IDS[category], decks[category].name + '::资料待核对'))
            pending_decks[category].add_note(note)
        else:
            decks[entry['category']].add_note(note)
    specifications = [('IELTS538-第一章完整牌组.apkg', None)] + [('IELTS538-第一章第%s类.apkg' % NUMERALS[category], category) for category in NUMERALS]
    output.mkdir(parents=True, exist_ok=True)
    packages = []
    for filename, category in specifications:
        selected = entries if category is None else [entry for entry in entries if entry['category'] == category]
        selected_decks = [genanki.Deck(ROOT_DECK_ID, ROOT_NAME)]
        selected_decks += [deck for key, deck in decks.items() if category is None or category == key]
        selected_decks += [deck for key, deck in pending_decks.items() if category is None or category == key]
        path = output / filename
        write_package(genanki.Package(selected_decks), path)
        packages.append(dict(filename=filename, category=category, **validate_package(path, selected)))
    manifest = dict(export_version=NAMESPACE, source_version=corpus.get('version'),
                    source_filename=source.name, source_sha256=hashlib.sha256(raw).hexdigest(),
                    notes=len(entries), cards=len(entries), active_notes=sum(e['status'] != 'pending' for e in entries),
                    pending_notes=sum(e['status'] == 'pending' for e in entries),
                    source_expression_count=sum(len(e['expressions']) for e in entries),
                    statuses=dict(sorted(Counter(e['status'] for e in entries).items())),
                    categories={str(c): sum(e['category'] == c for e in entries) for c in NUMERALS},
                    relations=dict(sorted(Counter(e['relation'] for e in entries).items())),
                    model_id=MODEL_ID, root_deck_id=ROOT_DECK_ID, category_deck_ids=CATEGORY_DECK_IDS,
                    pending_deck_ids={c: PENDING_DECK_IDS[c] for c in pending_decks},
                    note_guids=[dict(source_id=e['id'], guid=e['guid'], category=e['category'], status=e['status']) for e in entries],
                    packages=packages, media_files=0,
                    scope='Current source groups only; book 538 is not a distinct-group count')
    (output / 'index.html').write_text(preview_html(entries, packages, templates), encoding='utf-8')
    (output / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    arguments = parser.parse_args()
    try: manifest = export_corpus(arguments.source, arguments.output)
    except (ValueError, OSError) as error: parser.exit(2, 'Export failed: ' + str(error) + '\n')
    print(json.dumps({key: manifest[key] for key in ['notes', 'cards', 'active_notes', 'pending_notes', 'source_expression_count', 'categories', 'statuses']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
