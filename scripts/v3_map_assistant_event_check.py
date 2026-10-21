"""Opt-in: three billable live answers using synthetic event/house data only."""
import argparse
import json
import os
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from dotenv import dotenv_values
from backend.v3.map_assistant import MapAssistantRequest, _request_answer


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live',action='store_true')
    args=parser.parse_args()
    if not args.live: parser.error('--live is required (three billable answers).')
    local={**dotenv_values(ROOT/'.env'),**dotenv_values(ROOT/'.env.v3.local')}
    key=(os.getenv('OPENAI_TEST_API_KEY') or local.get('OPENAI_TEST_API_KEY') or '').strip()
    if not key: parser.error('OPENAI_TEST_API_KEY is missing. No normal-user key fallback.')
    model=os.getenv('V3_MAP_ASSISTANT_MODEL') or local.get('V3_MAP_ASSISTANT_MODEL')
    if model: os.environ['V3_MAP_ASSISTANT_MODEL']=model
    context=dict(date='2026-10-21',time='12:00',timezone='Asia/Tokyo',
        selected_event=dict(title='月がネイタル第12ハウスへ移動',type='natal_house_ingress',date='2026-10-21',time='12:00',planet='MOON',house_basis='natal',target_house=12),
        query_positions=[['N:SUN',165],['T:MOON',329.9]],query_houses=[['N:SUN',5,6,None,None],['T:MOON',10,11,2,6]],query_motion=[['T:MOON',False]])
    for origin,question,change in [
        ('event_suggestion','このハウスに入ると、どんなテーマが強まる？',{}),
        ('free_text','月はいま出生図では何ハウス？ソーラーでは何ハウス？',{}),
        ('free_text','月はいま出生図では何ハウス？',{'date':'2026-10-22'}),
    ]:
        payload=MapAssistantRequest(question=question,question_origin=origin,context={**context,**change})
        answer=_request_answer(payload,question,key)
        print(json.dumps({'question_origin':origin,'question':question,'changed_date':change.get('date'),'answer':answer},ensure_ascii=False),flush=True)
    print('These are live answers for manual review, not an automatic quality guarantee.')


if __name__=='__main__': main()
