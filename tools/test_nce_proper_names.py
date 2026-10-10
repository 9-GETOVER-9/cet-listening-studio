import hashlib
import unittest
from build_nce_proper_names import build_name_index


class ProperNameIndexTests(unittest.TestCase):
    def test_only_reviewed_names_and_original_nce_sentences_are_indexed(self):
        cards = [
            {'cardId': 'one', 'level': 'NCE', 'englishText': 'John lives in London. The cat waits.'},
            {'cardId': 'title', 'level': 'NCE', 'englishText': 'John', 'isTitle': True},
            {'cardId': 'merge', 'level': 'NCE', 'englishText': 'John', 'isMerged': True},
            {'cardId': 'cet', 'level': 'CET4', 'englishText': 'John'},
        ]
        result = build_name_index(cards, {'people': ['John'], 'places': ['London']})
        self.assertEqual(set(result), {'one'})
        self.assertEqual(result['one']['textHash'], hashlib.sha256(cards[0]['englishText'].encode('utf-8')).hexdigest())
        self.assertEqual(result['one']['spans'], [
            {'start': 0, 'end': 4, 'kind': 'person'},
            {'start': 14, 'end': 20, 'kind': 'place'},
        ])

    def test_longest_exact_name_wins_and_offsets_use_javascript_utf16(self):
        text = '😀 John Smith sees New York, then John. Johnson waits in Yorkshire.'
        result = build_name_index([{'cardId': 'one', 'level': 'NCE', 'englishText': text}],
                                  {'people': ['John', 'John Smith'], 'places': ['New York', 'York']})
        spans = result['one']['spans']
        self.assertEqual(spans, [
            {'start': 3, 'end': 13, 'kind': 'person'},
            {'start': 19, 'end': 27, 'kind': 'place'},
            {'start': 34, 'end': 38, 'kind': 'person'},
        ])

    def test_case_and_word_boundaries_do_not_exempt_unrelated_words(self):
        result = build_name_index([{'cardId': 'one', 'level': 'NCE', 'englishText': "john The He Londoner London's road"}],
                                  {'people': ['John'], 'places': ['London']})
        self.assertEqual(result['one']['spans'], [{'start': 21, 'end': 29, 'kind': 'place'}])


if __name__ == '__main__':
    unittest.main()