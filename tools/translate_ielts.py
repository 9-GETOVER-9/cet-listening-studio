"""Resumeable IELTS glossary completion using the existing configured translation API."""
import concurrent.futures
import json
import os
from pathlib import Path
import re
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
corpus = json.loads((ROOT / 'public/data/ielts-corpus-v1.json').read_text(encoding='utf8'))
hf = json.loads((ROOT / 'public/data/ielts-high-frequency-v1.json').read_text(encoding='utf8'))
cache = ROOT / 'docs/ielts-wanglu-translations.json'
meanings = json.loads(cache.read_text(encoding='utf8')) if cache.exists() else {}
for card in hf['cards']:
    meanings.setdefault(card['word'].casefold(), card['chinese'])
words = sorted({c['word'].casefold() for c in corpus['cards']} - meanings.keys())


def translate(batch):
    for attempt in range(3):
        try:
            body = dict(model='deepseek-flash', thinking={'type': 'disabled'},
                messages=[{'role': 'system', 'content': '你是雅思听力词汇编辑。将每个英文单词或词组翻译为简短准确的简体中文释义，适合普通话朗读。根据雅思学习/生活场景选常见义，确有歧义时列出2个常见义，以分号分隔。保留数字含义、复数/时态/专有名词实际所指；不写词性缩写、解释前缀、英文或猜测的例句。输入是编号到英文的JSON对象，输出且仅输出同样编号到中文释义的JSON对象，所有编号必须完整。'},
                    {'role': 'user', 'content': json.dumps(dict(enumerate(batch)), ensure_ascii=False)}],
                response_format={'type': 'json_object'}, max_tokens=8000)
            req = urllib.request.Request('https://api.deepseek.com/chat/completions',
                data=json.dumps(body).encode(), headers={'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + os.environ['DEEPSEEK_API_KEY']})
            with urllib.request.urlopen(req, timeout=180) as response:
                data = json.load(response)
            output = json.loads(data['choices'][0]['message']['content'])
            if set(output) != {str(i) for i in range(len(batch))}:
                raise ValueError('Translation IDs missing or extra')
            if any(not isinstance(v, str) or not re.search(r'[\u4e00-\u9fff]', v) or len(v) > 100 for v in output.values()):
                raise ValueError('Invalid Chinese meaning')
            return {word: output[str(i)] for i, word in enumerate(batch)}
        except Exception as exc:
            if attempt == 2:
                raise RuntimeError(f'Batch translation failed: {type(exc).__name__}') from None
            time.sleep(2)


print(f'existing={len(meanings)} missing={len(words)}', flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    futures = [pool.submit(translate, words[i:i+70]) for i in range(0, len(words), 70)]
    for future in concurrent.futures.as_completed(futures):
        meanings.update(future.result())
        cache.write_text(json.dumps(meanings, ensure_ascii=False, indent=2), encoding='utf8')
        print(f'translated={len(meanings)}', flush=True)
print('complete', flush=True)
