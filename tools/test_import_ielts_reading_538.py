"""Behavior tests for lossless first-chapter reading vocabulary import."""
import csv
import importlib.util
from pathlib import Path
import tempfile
import unittest


class ReadingImportTests(unittest.TestCase):
    def importer(self):
        path = Path(__file__).with_name('import_ielts_reading_538.py')
        self.assertTrue(path.exists(), 'Reading importer implementation is required')
        spec = importlib.util.spec_from_file_location('reading_importer', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def row(self, word='test', expressions='one, two', category='1', status='自动提取'):
        return {'类别': category, '考点词': word, '常考中文词义': 'n. 测试',
                '真题考点对应': expressions, '核对状态': status}

    def test_expression_delimiters_do_not_break_internal_phrases(self):
        cards = self.importer().build_cards([self.row(expressions='apply A to B； arm or leg, both...and; on the one hand...on the other hand...')])
        self.assertEqual([e['text'] for e in cards[0]['expressions']],
                         ['apply A to B', 'arm or leg', 'both...and', 'on the one hand...on the other hand...'])

    def test_structural_relations_are_metadata_and_footnotes_are_removed(self):
        module = self.importer()
        cases = [('that*', 'this; such（指代关系）', 'reference', ['this', 'such']),
                 ('and*', 'or, both...and*并列结构是雅思阅读的重要考点', 'parallel', ['or', 'both...and']),
                 ('rather than*', 'but; instead*转折结构是雅思阅读的重要考点', 'contrast', ['but', 'instead']),
                 ('thanks to*', 'stem from, hence*因果关系是雅思阅读的重要考点', 'cause', ['stem from', 'hence'])]
        for word, expressions, relation, expected in cases:
            with self.subTest(word=word):
                card = module.build_cards([self.row(word=word, expressions=expressions)])[0]
                self.assertEqual(card['word'], word.rstrip('*'))
                self.assertEqual(card['relation'], relation)
                self.assertEqual([e['text'] for e in card['expressions']], expected)

    def test_card_and_expression_ids_survive_reordering_and_meaning_correction(self):
        module = self.importer()
        original = self.row(word=' Rely  ON ', expressions='depend on; count on')
        corrected = self.row(word='rely on', expressions='count on, depend on')
        corrected['常考中文词义'] = '依赖'
        first = module.build_cards([original])[0]
        second = module.build_cards([self.row(word='other'), corrected])[1]
        self.assertEqual(first['id'], second['id'])
        self.assertEqual({e['text']: e['id'] for e in first['expressions']},
                         {e['text']: e['id'] for e in second['expressions']})
        self.assertEqual((first['sourceRow'], second['sourceRow']), (2, 3))

    def test_pending_fertiliser_is_context_and_remains_browsable(self):
        card = self.importer().build_cards([self.row(word='fertiliser', expressions='chemical, toxic, unnatural', status='待核对')])[0]
        self.assertEqual(card['status'], 'pending')
        self.assertEqual(card['relation'], 'context')
        self.assertEqual(len(card['expressions']), 3)

    def test_pdf_confirmed_ocr_repair_uses_canonical_spelling_and_identity(self):
        module = self.importer()
        damaged = module.build_cards([self.row(word='fulfll', expressions='execute', category='3')], source_audited=True)[0]
        canonical = module.build_cards([self.row(word='fulfill', expressions='execute', category='3')])[0]
        self.assertEqual(damaged['word'], 'fulfill')
        self.assertEqual(damaged['id'], canonical['id'])
        self.assertEqual(damaged['status'], 'verified')

    def test_duplicate_normalized_identity_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            self.importer().build_cards([self.row(word='rely on'), self.row(word=' Rely  ON ')])

    def test_duplicate_normalized_expressions_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate normalized expression'):
            self.importer().build_cards([self.row(expressions='Depend on; depend ON')])

    def fixture_sources(self, directory):
        directory = Path(directory)
        source, markdown, pdf = [directory / name for name in ('source.csv', 'source.md', 'source.pdf')]
        rows = [self.row(word=f'word-{category}-{index}', category=str(category))
                for category, count in ((1, 20), (2, 100), (3, 256)) for index in range(count)]
        rows[120] = self.row(word='fulfll', expressions='execute', category='3', status='待核对')
        with source.open('w', encoding='utf-8', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
            writer.writeheader()
            writer.writerows(rows)
        table = '<table><tr><td>考点词</td></tr><tr><td>test</td><td>n. 测试</td><td>one, two</td></tr></table>'
        markdown.write_text('## 雅思阅读538考点词\n20+34=54 100+71=171 256+57=313\n' + table * 4 + '\n## 最后重申', encoding='utf-8')
        pdf.write_bytes(b'Unreviewed PDF fixture')
        return source, markdown, pdf

    def test_missing_pdf_preserves_existing_dataset_and_report_bytes(self):
        module = self.importer()
        with tempfile.TemporaryDirectory() as directory:
            source, markdown, pdf = self.fixture_sources(directory)
            pdf.unlink()
            output, report = Path(directory) / 'dataset.json', Path(directory) / 'report.json'
            output.write_bytes(b'previous good dataset')
            report.write_bytes(b'previous good report')
            with self.assertRaises(FileNotFoundError):
                module.import_corpus(source, markdown, pdf, output, report)
            self.assertEqual(output.read_bytes(), b'previous good dataset')
            self.assertEqual(report.read_bytes(), b'previous good report')

    def test_unaudited_inputs_do_not_inherit_visual_claims_or_verified_repair(self):
        module = self.importer()
        with tempfile.TemporaryDirectory() as directory:
            source, markdown, pdf = self.fixture_sources(directory)
            output, report = Path(directory) / 'dataset.json', Path(directory) / 'report.json'
            audit = module.import_corpus(source, markdown, pdf, output, report)
            import json
            card = json.loads(output.read_text(encoding='utf-8'))['cards'][120]
            self.assertEqual(card['word'], 'fulfll')
            self.assertEqual(card['status'], 'pending')
            self.assertEqual(audit['pdfVisualChecks'], [])
            self.assertEqual(audit['repairs'], [])
            self.assertFalse(audit['visualAuditCoverage']['sourceFingerprintsMatch'])

    def test_pending_ocr_like_word_is_not_promoted_by_builder(self):
        card = self.importer().build_cards([self.row(word='fulfll', expressions='execute', category='3', status='待核对')])[0]
        self.assertEqual(card['word'], 'fulfll')
        self.assertEqual(card['status'], 'pending')

    def test_unknown_source_status_and_empty_expression_fail_closed(self):
        module = self.importer()
        with self.assertRaisesRegex(ValueError, 'status'):
            module.build_cards([self.row(status='未知')])
        with self.assertRaisesRegex(ValueError, 'expression'):
            module.build_cards([self.row(expressions=' ; , ')])

    def test_audit_stops_at_actual_first_chapter_end_heading(self):
        module = self.importer()
        table = '<table><tr><td>考点词</td></tr><tr><td>test</td><td>n. 测试</td><td>one, two</td></tr></table>'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'source.md'
            path.write_text('## 雅思阅读538考点词\n20+34=54 100+71=171 256+57=313\n' + table * 4 +
                            '\n## 最后重申\n## 第二章\n' + table, encoding='utf-8')
            audit = module.audit_markdown([self.row()], path)
            self.assertEqual(audit['tables'], 4)
            self.assertEqual(audit['identicalCsvOcrRows'], 1)
            self.assertTrue(audit['bookCountDeclarationsPresent'])


if __name__ == '__main__':
    unittest.main()
