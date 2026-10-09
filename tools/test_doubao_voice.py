import base64
import json
import unittest
from doubao_ielts_voice import decode_stream, make_plan, make_payload, spoken_chinese


class DoubaoVoiceTests(unittest.TestCase):
    def test_spoken_definitions_omit_anki_part_of_speech_codes(self):
        self.assertEqual(spoken_chinese('adj./学术的 n./学者'), '学术的，学者')
        self.assertEqual(spoken_chinese('n./背部 adj./后面的'), '背部，后面的')
        self.assertEqual(spoken_chinese('教学助理'), '教学助理')
    def test_tts_additions_is_a_json_string_required_by_service(self):
        payload = make_payload('你好', 'voice-id', '甜美清晰')
        self.assertEqual(json.loads(payload['req_params']['additions']), dict(context_texts=['甜美清晰']))
    def test_stream_requires_completion_and_joins_audio_chunks(self):
        lines = [json.dumps(dict(code=0, data=base64.b64encode(b'first').decode())),
                 json.dumps(dict(code=0, data=base64.b64encode(b'second').decode())),
                 json.dumps(dict(code=20000000, data=None))]
        self.assertEqual(decode_stream(lines), b'firstsecond')
        with self.assertRaises(ValueError):
            decode_stream(lines[:-1])
        with self.assertRaises(ValueError):
            decode_stream([json.dumps(dict(code=45000000, data=None))])
        with self.assertRaises(ValueError):
            decode_stream([lines[-1]])

    def test_plan_deduplicates_chinese_across_both_books_without_losing_cards(self):
        books = [dict(cards=[dict(chinese='苹果'), dict(chinese='苹果')], tracks=[{}]),
                 dict(cards=[dict(chinese='苹果'), dict(chinese='香蕉')], tracks=[{}, {}])]
        self.assertEqual(make_plan(books), dict(cards=4, tracks=3, uniqueTexts=2, characters=4))


if __name__ == '__main__':
    unittest.main()
