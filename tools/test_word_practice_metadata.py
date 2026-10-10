"""Exact dictionary metadata stays separate from spelling answers and source materials."""
import csv
import importlib.util
import tempfile
import unittest
from pathlib import Path


class MetadataTests(unittest.TestCase):
    def importer(self):
        path = Path(__file__).with_name('build_word_practice_metadata.py')
        self.assertTrue(path.is_file(), 'Metadata builder must exist')
        spec = importlib.util.spec_from_file_location('metadata_builder', path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_exact_case_normalized_matches_only_and_real_fields(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'dictionary.csv'
            with path.open('w', encoding='utf-8', newline='') as stream:
                writer = csv.DictWriter(stream, fieldnames=['word', 'translation', 'phonetic', 'pos'])
                writer.writeheader()
                writer.writerows([
                    {'word': 'station', 'translation': 'n. 车站\\n火车站', 'phonetic': 'steɪʃən', 'pos': 'n'},
                    {'word': 'current account', 'translation': '活期账户', 'phonetic': '', 'pos': ''},
                    {'word': 'unrelated', 'translation': '不相关', 'phonetic': '', 'pos': ''},
                ])
            result = self.importer().read_exact_metadata(path, {' STATION ', 'current account', 'stations', 'unknown'})
            self.assertEqual(set(result), {'station', 'current account'})
            self.assertEqual(result['station']['ipa'], 'steɪʃən')
            self.assertEqual(result['station']['meaning'], 'n. 车站\n火车站')
            self.assertNotIn('ipa', result['current account'])

    def test_coverage_candidates_contain_words_and_exact_phrase_without_original_sentences(self):
        candidates = self.importer().candidate_words({'cards': [
            {'englishText': 'He opened a current account.', 'aiAnalysis': {'phrases': [{'phrase': 'current account'}]}},
            {'word': 'station', 'answers': ['station', 'stations']},
        ]})
        self.assertIn('opened', candidates)
        self.assertIn('current account', candidates)
        self.assertIn('stations', candidates)
        self.assertNotIn('he opened a current account.', candidates)


if __name__ == '__main__':
    unittest.main()