"""Offline network corpus regression tests (stdlib only)."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / 'tools/build_ielts_network.py'
SOURCE = Path(r'D:\桌面\Project\Self\English Saying\deliverables\剑20_3_4_5_8_11_vs_高频语料库\听力语料库.apkg')
SOURCE_HASHES = {
    'ielts-corpus-v1.json': '3313d24332a7306b9216ac16cb24f6e9e024543f116ac074caae0a60dac4c852',
    'ielts-high-frequency-v1.json': '36461bae71934fc78288ca279ad268494f0f205fee3e6e3272e3a3875daae74a',
}


class NetworkTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(BUILDER.exists(), 'offline network builder is missing')
        spec = importlib.util.spec_from_file_location('network_builder', BUILDER)
        self.builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.builder)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.public = Path(self.temp.name, 'public')
        (self.public / 'data/audio/ielts').mkdir(parents=True)
        (self.public / 'data/audio/ielts/english.mp3').write_bytes(b'english')
        self.card = dict(id='original-1', chapter=3, section='3.1', word='curly’s / variant=variants',
                         chinese='测试', answers=['curly’s', 'variant=variants'],
                         audio='/data/audio/ielts/english.mp3')
        self.note = dict(id=10, Word='<b>Curly’s / variant=variants</b>', Source='Chapter3, Chapter5')

    def build(self, notes=None, cards=None, frequency=None):
        return self.builder.build_network(notes or [self.note], {'cards': cards or [self.card]},
                                          {'cards': frequency or []}, self.public)

    def test_normalization_preserves_word_variants(self):
        normal = self.builder.normalize_word
        self.assertEqual(normal('<b>ＦＯＯ</b>&nbsp;Bar’s—baz'), "foo bar's-baz")
        self.assertEqual(normal('a / b=c'), 'a / b=c')
        self.assertNotEqual(normal('student'), normal('students'))

    def test_reuses_canonical_fields_with_primary_chapter_and_all_sources(self):
        other = dict(self.card, id='other', chapter=5, section='5.2', chinese='other meaning')
        before = copy.deepcopy([other, self.card])
        result = self.build(cards=[other, self.card])
        output = result['cards'][0]
        self.assertEqual(output['id'], 'network-10')
        self.assertEqual(output['chapter'], 3)
        self.assertEqual(output['chapters'], [3, 5])
        self.assertEqual(output['section'], '3.1')
        self.assertEqual(output['answers'], self.card['answers'])
        self.assertEqual(output['audio'], self.card['audio'])
        self.assertEqual(output['chinese'], self.card['chinese'])
        self.assertEqual(output['sourceBook'], 'network')
        self.assertEqual([other, self.card], before)

    def test_filters_frequency_only_notes_and_groups_chapters_stably(self):
        card5 = dict(self.card, id='five', word='other', chapter=5, section='5.1')
        notes = [dict(id=1, Word='other', Source='Chapter5'), self.note,
                 dict(id=99, Word='not a chapter', Source='Frequency')]
        result = self.build(notes=notes, cards=[card5, self.card])
        self.assertEqual([c['id'] for c in result['cards']], ['network-10', 'network-1'])

    def test_rejects_duplicate_network_words(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            self.build(notes=[self.note, dict(self.note, id=11)])

    def test_rejects_frequency_overlap(self):
        with self.assertRaisesRegex(ValueError, 'overlap'):
            self.build(frequency=[self.card])

    def test_rejects_missing_reference(self):
        with self.assertRaisesRegex(ValueError, 'reference'):
            self.build(notes=[dict(self.note, Word='unknown')])

    def test_rejects_missing_english_audio(self):
        with self.assertRaisesRegex(ValueError, 'audio'):
            self.build(cards=[dict(self.card, audio='/data/audio/ielts/missing.mp3')])

    def test_chinese_index_copies_cached_content_and_preserves_original_id(self):
        cache, output = Path(self.temp.name, 'cache'), self.public / 'data/audio/ielts-zh'
        cache.mkdir()
        text = self.card['chinese']
        signature = json.dumps(['seed-tts-2.0', 'zh_female_tianmeitaozi_uranus_bigtts',
                                '请用甜美温柔、自然清晰的普通话朗读，适合英语词汇学习。', text],
                               ensure_ascii=False).encode()
        audio = b'cached chinese clip'
        (cache / (hashlib.sha256(signature).hexdigest()[:24] + '.mp3')).write_bytes(audio)
        book = dict(cards=[self.card], chineseVoice={'provider': 'Doubao', 'speaker': 'zh_female_tianmeitaozi_uranus_bigtts', 'resourceId': 'seed-tts-2.0'})
        result = self.builder.build_chinese_index([('wanglu', book)], cache, output)
        path = '/data/audio/ielts-zh/' + hashlib.sha256(audio).hexdigest()[:24] + '.mp3'
        self.assertEqual(result['cards'][0]['id'], self.card['id'])
        self.assertEqual(result['cards'][0]['chineseAudio'], path)
        self.assertEqual(result['cards'][0]['sourceBook'], 'wanglu')
        self.assertEqual((output / Path(path).name).read_bytes(), audio)
        self.assertNotIn('chineseAudio', self.card)

    def test_missing_chinese_cache_fails_before_copy(self):
        output = Path(self.temp.name, 'clips')
        with self.assertRaisesRegex(ValueError, 'cached Chinese'):
            self.builder.build_chinese_index([('wanglu', {'cards': [self.card]})],
                                             Path(self.temp.name, 'missing'), output)
        self.assertFalse(output.exists())

    def test_actual_source_count_chapters_and_original_hashes(self):
        books = []
        for name, digest in SOURCE_HASHES.items():
            data = (ROOT / 'public/data' / name).read_bytes()
            self.assertEqual(hashlib.sha256(data).hexdigest(), digest)
            books.append(json.loads(data))
        notes = self.builder.read_apkg_notes(SOURCE)
        self.assertEqual(len(notes), 4853)
        result = self.builder.build_network(notes, *books, ROOT / 'public')
        self.assertEqual(len(result['cards']), 4147)
        self.assertEqual(self.builder.chapter_counts(result['cards']),
                         {3: 564, 4: 225, 5: 1443, 8: 359, 11: 1556})
        words = [self.builder.normalize_word(c['word']) for c in result['cards']]
        self.assertEqual(len(set(words)), 4147)
        self.assertFalse(set(words) & {self.builder.normalize_word(c['word']) for c in books[1]['cards']})


if __name__ == '__main__':
    unittest.main()
