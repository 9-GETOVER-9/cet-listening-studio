import unittest

try:
    from build_ielts_annotations import build_annotations, extract_note
except ImportError:
    build_annotations = extract_note = None


class AnnotationImportTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(build_annotations, 'Annotation importer is not implemented')
        self.card = dict(id='ielts-hf-12', word='oxygen', chapter=2, section='151-200', chinese='n./氧气')
        self.row = {'笔记 ID': '="12"', 'Unit': 'Unit2::151-200', '词条': 'oxygen',
                    '释义': 'n./氧气 注意拼写', '笔记内容': 'Audio：；Word：oxygen；Definition：n./氧气 注意拼写；Source：Unit2 #155',
                    '旗帜名称': '听出来了，但拼写错', '旗帜颜色': '粉色', 'Again': '17'}

    def test_preserves_supplement_without_exporting_statistics(self):
        seed = build_annotations([self.row], [self.card])
        self.assertEqual(seed['cards'], [dict(cardId='ielts-hf-12', note='注意拼写', reason='spelling', sourceFlag='听出来了，但拼写错')])
        self.assertNotIn('Again', str(seed))

    def test_extracts_source_tail_even_when_definition_has_no_extra_text(self):
        self.row['释义'] = 'n./氧气'
        self.row['笔记内容'] = 'Audio：；Word：oxygen；Definition：n./氧气；Source：Unit2 #155 和别的词容易弄混'
        self.assertEqual(extract_note(self.row, self.card['chinese']), '和别的词容易弄混')

    def test_deduplicates_repeated_source_tail_and_preserves_nonprefix_meaning(self):
        self.row['笔记内容'] += ' 注意拼写'
        self.assertEqual(extract_note(self.row, self.card['chinese']), '注意拼写')
        self.row['释义'] = '补充的中文含义'
        self.assertIn('补充的中文含义', extract_note(self.row, self.card['chinese']))

    def test_does_not_match_same_word_in_another_unit_or_execute_excel_formula(self):
        for key, value in [('Unit', 'Unit8::151-200'), ('笔记 ID', '=HYPERLINK("bad")')]:
            invalid = {**self.row, key: value}
            with self.assertRaises(ValueError):
                build_annotations([invalid], [self.card])

    def test_maps_flags_and_keeps_attention_note_without_false_cause(self):
        for name, reason in [('认识，但没听出来', 'pronunciation'), ('发音和自己想的不一样', 'pronunciation'),
                             ('连读、弱读没听出来', 'pronunciation'), ('单复数错', 'spelling'),
                             ('完全不认识', 'both'), ('听的时候走神', None)]:
            seed = build_annotations([{**self.row, '旗帜名称': name}], [self.card])
            self.assertEqual(seed['cards'][0]['reason'], reason)
            self.assertEqual(seed['cards'][0]['sourceFlag'], name)

    def test_empty_unflagged_cards_omit_seed_and_duplicate_ids_fail(self):
        empty = {**self.row, '释义': self.card['chinese'], '笔记内容': '', '旗帜名称': '', '旗帜颜色': ''}
        self.assertEqual(build_annotations([empty], [self.card])['cards'], [])
        with self.assertRaises(ValueError):
            build_annotations([self.row, self.row], [self.card])


if __name__ == '__main__':
    unittest.main()
