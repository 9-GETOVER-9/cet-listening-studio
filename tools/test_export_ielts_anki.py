"""Offline export regression tests; no Anki installation or source corpus needed."""
import copy
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import zipfile
from contextlib import closing
from unittest.mock import patch


MODULE = Path(__file__).with_name('export_ielts_anki.py')


def fixture():
    relations = ['lexical', 'reference', 'parallel', 'contrast', 'cause', 'context']
    cards = []
    for i, relation in enumerate(relations):
        texts = [' answer  A ', 'ANSWER a', 'answer B', 'answer C', 'answer D', 'answer E'] if i == 0 else ['expression ' + str(i)]
        cards.append(dict(id='source-' + str(i), category=(i % 3) + 1, order=i + 1,
                          sourceRow=i + 2, word='word ' + str(i), meaning='含义 <b>&"',
                          relation=relation, status='pending' if i == 5 else 'extracted',
                          expressions=[dict(id='expression-%s-%s' % (i, j), text=t) for j, t in enumerate(texts)]))
    return dict(version='fixture-v1', title='测试', cards=cards)


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(MODULE.exists(), 'Offline exporter must exist')
        spec = importlib.util.spec_from_file_location('exporter', MODULE)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def export(self, data, root):
        source = root / 'source.json'
        source.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        return self.module.export_corpus(source, root / 'export')

    def read_package(self, path):
        with tempfile.TemporaryDirectory() as directory:
            with zipfile.ZipFile(path) as archive:
                self.assertEqual(json.loads(archive.read('media')), {})
                database = Path(directory) / 'collection.anki2'
                database.write_bytes(archive.read('collection.anki2'))
            with closing(sqlite3.connect(database)) as connection:
                notes = connection.execute('select guid, mid, flds from notes').fetchall()
                cards = connection.execute('select nid, did, ord, queue from cards').fetchall()
                models, decks = connection.execute('select models, decks from col').fetchone()
                return notes, cards, json.loads(models), json.loads(decks)

    def test_invalid_input_fails_before_writing(self):
        for change in ['duplicate', 'category', 'relation', 'status', 'empty', 'separator', 'type']:
            with self.subTest(change=change), tempfile.TemporaryDirectory() as directory:
                data = fixture()
                if change == 'duplicate': data['cards'][1]['id'] = data['cards'][0]['id']
                if change == 'category': data['cards'][0]['category'] = 4
                if change == 'relation': data['cards'][0]['relation'] = 'unknown'
                if change == 'status': data['cards'][0]['status'] = 'unknown'
                if change == 'empty': data['cards'][0]['expressions'] = []
                if change == 'separator': data['cards'][0]['word'] = 'bad\x1fword'
                if change == 'type': data['cards'][0]['category'] = True
                root = Path(directory)
                with self.assertRaises(ValueError): self.export(data, root)
                self.assertFalse((root / 'export').exists())

    def test_all_normalized_answers_two_distinct_distractors_and_determinism(self):
        entries = self.module.build_entries(self.module.validate_corpus(fixture()))
        first = entries[0]
        correct = [c for c in first['choices'] if c['correct']]
        wrong = [c for c in first['choices'] if not c['correct']]
        self.assertEqual(len(correct), 5)  # no website four-answer cap
        self.assertEqual(len(wrong), 2)
        self.assertEqual(len({c['text'].casefold() for c in wrong}), 2)
        self.assertFalse(any(c['text'] == 'expression 5' for c in wrong))
        self.assertEqual(entries, self.module.build_entries(self.module.validate_corpus(fixture())))
        self.assertEqual(len(first['expressions']), 6)  # preserve original source list on back

    def test_structural_relation_prompts_and_pending_reference_only(self):
        entries = self.module.build_entries(self.module.validate_corpus(fixture()))
        for entry, label in zip(entries, ['词语对应', '指代', '并列', '转折', '因果', '语境']):
            self.assertIn(label, entry['prompt'])
            self.assertIn('书中', entry['prompt'])
            self.assertNotIn('同义', entry['prompt'])
        pending = entries[-1]
        self.assertEqual(pending['choices'], [])
        front, back = self.module.render_entry(pending)
        self.assertIn('资料待核对', front)
        self.assertNotIn('data-correct', front + back)
        self.assertNotIn('checkbox', front)
        self.assertNotIn('✓', back)
        self.assertIn('expression 5', back)

    def test_escape_source_text_and_static_back(self):
        data = fixture()
        data['cards'][0]['word'] = '</script><img src=x onerror=alert(1)>'
        data['cards'][0]['expressions'][0]['text'] = '<script>evil & "</script>'
        entry = self.module.build_entries(self.module.validate_corpus(data))[0]
        front, back = self.module.render_entry(entry)
        self.assertIn('&lt;img', front)
        self.assertIn('&lt;script&gt;evil', back)
        self.assertNotIn('<img', front)
        self.assertNotIn('<script>', back)
        self.assertNotIn('{{FrontSide}}', self.module.load_templates()['back'])
        self.assertIn('source-0', back)
        self.assertIn('extracted', back)

    def test_guid_reimport_alignment_and_category_packages(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = self.export(fixture(), root)
            notes, cards, models, decks = self.read_package(root / 'export' / manifest['packages'][0]['filename'])
            self.assertEqual(len(notes), 6)
            self.assertEqual(len(cards), 6)
            self.assertEqual(sum(c[3] == -1 for c in cards), 1)
            self.assertTrue(all(c[2] == 0 for c in cards))
            self.assertEqual(len(models), 1)
            self.assertNotIn('2087354011', models)
            pending_deck = next(int(k) for k, v in decks.items() if v['name'].endswith('资料待核对'))
            self.assertEqual(next(c[3] for c in cards if c[1] == pending_deck), -1)
            all_guids = {n[0] for n in notes}
            category_guids = set()
            for package in manifest['packages'][1:]:
                category_notes, category_cards, category_models, _ = self.read_package(root / 'export' / package['filename'])
                self.assertEqual(len(category_notes), package['notes'])
                self.assertEqual(len(category_cards), package['cards'])
                self.assertEqual(set(category_models), set(models))
                category_guids.update(n[0] for n in category_notes)
            self.assertEqual(all_guids, category_guids)
            modified = fixture()
            modified['cards'][0]['word'] = 'corrected word'
            modified['cards'][0]['expressions'][0]['text'] = 'corrected answer'
            updated = self.export(modified, root)
            next_notes, _, next_models, _ = self.read_package(root / 'export' / updated['packages'][0]['filename'])
            self.assertEqual(all_guids, {n[0] for n in next_notes})
            self.assertEqual(set(models), set(next_models))
            self.assertEqual(models[next(iter(models))]['flds'], next_models[next(iter(models))]['flds'])
            self.assertEqual(manifest['notes'], 6)
            self.assertEqual(manifest['active_notes'], 5)
            self.assertEqual(manifest['pending_notes'], 1)
            self.assertEqual(len(manifest['source_sha256']), 64)
            self.assertNotEqual(manifest['source_sha256'], updated['source_sha256'])
            self.assertEqual(len(manifest['note_guids']), 6)

    def test_preview_safe_local_and_complete(self):
        with tempfile.TemporaryDirectory() as directory:
            data = fixture()
            data['cards'][0]['word'] = '</script><script>danger()</script>'
            root = Path(directory)
            manifest = self.export(data, root)
            preview = (root / 'export' / 'index.html').read_text(encoding='utf-8')
            self.assertNotIn('</script><script>danger()', preview)
            self.assertNotIn('eval(', preview)
            self.assertNotIn('fetch(', preview)
            self.assertIn('aria-label="选择词条"', preview)
            for package in manifest['packages']: self.assertIn(package['filename'], preview)
            for card in data['cards']: self.assertIn(card['id'], preview)

    def test_choice_controls_under_client_eval_and_repeated_render(self):
        from playwright.sync_api import sync_playwright
        templates = self.module.load_templates()
        entry = self.module.build_entries(self.module.validate_corpus(fixture()))[0]
        front, _ = self.module.render_entry(entry)
        markup = front.split('<script>')[0]
        with sync_playwright() as browser_api:
            browser = browser_api.chromium.launch(channel='msedge', headless=True)
            page = browser.new_page()
            for _ in range(2):
                page.set_content('<style>' + templates['css'] + '</style>' + markup)
                page.evaluate(templates['js'])  # document.currentScript is null in this client path
                page.locator('[data-check]').click()
                self.assertIn('请先选择', page.locator('.result').inner_text())
                page.locator('[data-correct="yes"] input').first.check()
                page.locator('[data-correct="no"] input').first.check()
                page.locator('[data-check]').click()
                self.assertEqual(page.locator('.choice.good').count(), 1)
                self.assertEqual(page.locator('.choice.missed').count(), 4)
                self.assertEqual(page.locator('.choice.bad').count(), 1)
                self.assertEqual(page.locator('.choice.good').evaluate('(e)=>getComputedStyle(e).backgroundColor'), 'rgb(220, 252, 231)')
                self.assertEqual(page.locator('.choice.missed').first.evaluate('(e)=>getComputedStyle(e).backgroundColor'), 'rgb(254, 226, 226)')
                page.locator('[data-reset]').click()
                self.assertEqual(page.locator('input:checked').count(), 0)
                self.assertEqual(page.locator('input:disabled').count(), 0)
                self.assertTrue(page.locator('[data-check]').is_enabled())
                for checkbox in page.locator('[data-correct="yes"] input').all(): checkbox.check()
                page.locator('[data-check]').click()
                self.assertIn('全部选对', page.locator('.result').inner_text())
            browser.close()

    def test_package_database_temp_directory_is_removed_after_success(self):
        self.assertTrue(hasattr(self.module, 'write_package'), 'Controlled package writer must exist')
        created = []
        original = tempfile.TemporaryDirectory

        def track_directory(*args, **kwargs):
            directory = original(*args, **kwargs)
            created.append(Path(directory.name))
            return directory

        with original() as directory:
            target = Path(directory) / 'empty.apkg'
            package = self.module.genanki.Package(self.module.genanki.Deck(123456789, 'fixture'))
            with patch.object(self.module.tempfile, 'TemporaryDirectory', side_effect=track_directory):
                self.module.write_package(package, target)
            self.assertEqual(len(created), 1)
            self.assertFalse(created[0].exists())
            with zipfile.ZipFile(target) as archive:
                self.assertEqual(set(archive.namelist()), {'collection.anki2', 'media'})
                self.assertEqual(json.loads(archive.read('media')), {})
                database = Path(directory) / 'check.anki2'
                database.write_bytes(archive.read('collection.anki2'))
            with closing(sqlite3.connect(database)) as connection:
                self.assertEqual(connection.execute('pragma integrity_check').fetchone()[0], 'ok')

    def test_package_database_temp_directory_is_removed_after_write_failure(self):
        self.assertTrue(hasattr(self.module, 'write_package'), 'Controlled package writer must exist')
        created = []
        original = tempfile.TemporaryDirectory

        def track_directory(*args, **kwargs):
            directory = original(*args, **kwargs)
            created.append(Path(directory.name))
            return directory

        class BrokenPackage:
            media_files = []

            def write_to_db(self, cursor, timestamp, id_gen):
                cursor.execute('create table partially_written (id integer)')
                raise RuntimeError('Simulated database write failure')

        with original() as directory:
            target = Path(directory) / 'broken.apkg'
            with patch.object(self.module.tempfile, 'TemporaryDirectory', side_effect=track_directory):
                with self.assertRaisesRegex(RuntimeError, 'Simulated database write failure'):
                    self.module.write_package(BrokenPackage(), target)
            self.assertEqual(len(created), 1)
            self.assertFalse(created[0].exists())
            self.assertFalse(target.exists())


if __name__ == '__main__':
    unittest.main()
