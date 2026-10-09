import unittest
import json
from pathlib import Path
import sqlite3
import tempfile
import zipfile
from import_ielts import answer_variants, clean_text, import_corpus


class AnswerTests(unittest.TestCase):
    def test_html_is_decoded_without_rendering_markup(self):
        self.assertEqual(clean_text("<b>newsagent&#x27;s</b>&nbsp;&nbsp;"), "newsagent's")

    def test_optional_words_and_suffixes(self):
        self.assertEqual(set(answer_variants("a (great) variety of")), {"a great variety of", "a variety of"})
        self.assertEqual(set(answer_variants("local hero(es)")), {"local hero", "local heroes"})
        self.assertEqual(set(answer_variants("RA(research assistant)")), {"RA", "research assistant"})
        self.assertEqual(set(answer_variants("cheque/check")), {"cheque", "check"})

    def test_imports_selected_chapter_with_entity_encoded_media(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            connection = sqlite3.connect(root / 'collection.anki2')
            connection.executescript('create table col (decks text); create table notes (id integer, flds text); create table cards (nid integer, did integer);')
            connection.execute('insert into col values (?)', (json.dumps({'1': {'name': 'Corpus::B-Chapter3::3.1'}, '2': {'name': 'Corpus::Chapter6::6.1'}}),))
            connection.executemany('insert into notes values (?,?)', [(1, '[sound:cheque&amp;check.mp3]\x1fcheque/check'), (2, '[sound:absent.mp3]\x1fother')])
            connection.executemany('insert into cards values (?,?)', [(1, 1), (2, 2)])
            connection.commit()
            connection.close()
            source = root / 'source.apkg'
            with zipfile.ZipFile(source, 'w') as package:
                package.write(root / 'collection.anki2', 'collection.anki2')
                package.writestr('media', json.dumps({'0': 'cheque&check.mp3'}))
                package.writestr('0', b'ID3-test-audio')
            report = import_corpus(source, root / 'public', [3])
            data = json.loads((root / 'public/data/ielts-corpus-v1.json').read_text(encoding='utf-8'))
            self.assertEqual(report['cards'], 1)
            self.assertEqual(data['cards'][0]['answers'], ['cheque', 'check'])
            self.assertEqual((root / 'public' / data['cards'][0]['audio'].lstrip('/')).read_bytes(), b'ID3-test-audio')

    def test_known_missing_cheque_clip_uses_packaged_identical_word(self):
        from import_ielts import resolve_audio
        self.assertEqual(resolve_audio('31131_cheque&check.mp3', {'31793_cheque.mp3': '1'}), '31793_cheque.mp3')
        with self.assertRaises(ValueError):
            resolve_audio('unknown.mp3', {'31793_cheque.mp3': '1'})


if __name__ == '__main__':
    unittest.main()
