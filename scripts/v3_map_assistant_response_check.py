"""Opt-in live regression checks with synthetic house data, no personal data.

Run: python scripts/v3_map_assistant_response_check.py --live
Makes six billable requests using the local .env key; prints answers and usage.
No requests are made without --live. Does not alter accounts or quota records.
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv
from backend.v3.map_assistant import MapAssistantRequest, _request_answer
import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true')
    parser.add_argument('--plain', action='store_true', help='Use normal questions without a factual-line instruction; review prose manually.')
    args = parser.parse_args()
    if not args.live:
        parser.error('Actual API calls require --live (six billable requests).')
    load_dotenv(ROOT / '.env')
    key = os.getenv('OPENAI_API_KEY', '').strip()
    if not key:
        parser.error('OPENAI_API_KEY is missing from the local environment.')
    questions = [
        '今いらいらしやすい配置ですか？',
        '現在の火星は出生図とソーラーそれぞれ何ハウスですか？',
        '火星は出生図でも12ハウスという理解で合っていますか？',
    ]
    results = []
    real_post = httpx.post
    for natal_house in (6, None):
        screen = {'planet_mode': 'both', 'chart_natal_sun_sign': 5,
                  'positions': [['N:SUN', 165], ['T:MARS', 135]],
                  'houses': [['N:SUN', 5, 7, None, None], ['T:MARS', 4, natal_house, 2, 12]]}
        for question in questions:
            # Ask for a short factual line as well as prose, allowing deterministic checks.
            prompt = question if args.plain else question + '\n最後に「配置確認：出生図=X、ソーラー=Y」の形でハウス番号を記載してください。不明は不明と書いてください。'
            observed = {}
            def tracked_post(*args, **kwargs):
                response = real_post(*args, **kwargs)
                if response.is_success:
                    data = response.json()
                    observed.update(model=data.get('model'), usage=data.get('usage'), status=data.get('status'))
                return response
            with patch('backend.v3.map_assistant.httpx.post', side_effect=tracked_post):
                answer = _request_answer(MapAssistantRequest(question=prompt, context=screen), prompt, key)
            match = re.search(r'配置確認[：:]\s*出生図\s*[=＝]\s*(不明|\d+)(?:ハウス)?\s*[、,]\s*ソーラー\s*[=＝]\s*(不明|\d+)', answer)
            expected = ('不明' if natal_house is None else str(natal_house), '12')
            results.append({'question': question, 'expected_natal_house': natal_house,
                            'expected_solar_house': 12, 'factual_line_pass': None if args.plain else bool(match and match.groups() == expected),
                            'answer': answer, **observed})
            print(json.dumps(results[-1], ensure_ascii=False), flush=True)
    if args.plain:
        print(json.dumps({'total': len(results), 'note': 'Normal-question answers require prose review; no automatic quality pass is claimed.'}))
        return 0
    passed = sum(r['factual_line_pass'] for r in results)
    print(json.dumps({'passed': passed, 'total': len(results),
                      'note': 'The factual line is checked automatically; prose still requires review.'}, ensure_ascii=False))
    return 0 if passed == len(results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
