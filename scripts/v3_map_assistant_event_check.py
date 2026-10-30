"""Opt-in: three billable live answers using synthetic event/house data only."""
import argparse
import json
import os
import sys
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from dotenv import dotenv_values
from backend.v3.map_assistant import MapAssistantRequest, _request_answer
from backend.v3.map_assistant_tools import PLANETS, run_chart_tool


def check_conversations(key, output=None, selected_case=None):
    """Three synthetic three-turn conversations; print answers and inspected scopes."""
    for case, planet, natal_longitude, transit_longitude, angle in [
        ('opposition','MARS',165,345,180),('trine','VENUS',105,225,120),
        ('house_ingress','MOON',165,329.9,None),
    ]:
        if selected_case and selected_case != case:
            continue
        positions={f'N:{p}':(i*27+15)%360 for i,p in enumerate((*PLANETS,'ASC','MC'))}
        positions.update({f'T:{p}':(i*29+4)%360 for i,p in enumerate(PLANETS)})
        positions.update({'N:SUN':natal_longitude,f'T:{planet}':transit_longitude})
        sun_sign=int(natal_longitude//30)
        houses=[[point,int(lon//30),int(lon//30)+1,None,(int(lon//30)-sun_sign)%12+1 if point.startswith('T:') else None]
                for point,lon in positions.items()]
        event=dict(title=f'{planet}×出生太陽{angle}°',type='transit_natal_aspect',
                   date='2026-10-30',time='12:00',planet=planet,natal_planet='SUN',aspect_angle=angle)
        questions=['このアスペクトは私にどう関係する？',
                   'それだと仕事で人に強く言い返したくなったら、どう対応するとよい？',
                   'さっきの話の根拠になる天体の組み合わせとアスペクトをもう一度教えて。']
        if angle is None:
            event=dict(title='月がネイタル第12ハウスへ移動',type='natal_house_ingress',
                       date='2026-10-30',time='12:00',planet='MOON',house_basis='natal',target_house=12)
            questions=['このハウスに入ると、どんなテーマが強まる？',
                       'その時期、仕事で疲れたらどんな過ごし方がよい？',
                       'このイベントの移動先と、ソーラーハウスの番号をもう一度教えて。']
        context=dict(date='2026-10-30',time='12:00',timezone='Asia/Tokyo',selected_event=event,
                     query_positions=list(positions.items()),query_houses=houses,
                     query_motion=[(point,False) for point in positions])
        history=[]
        for turn,question in enumerate(questions):
            queries=[]
            def trace(name,arguments,ctx):
                result=run_chart_tool(name,arguments,ctx)
                queries.append({'tool':name,'arguments':arguments,'count':result.get('count'),'complete':result.get('complete')})
                return result
            payload=MapAssistantRequest(question=question,context=context,history=history[-6:],
                question_origin='event_suggestion' if turn==0 else 'free_text')
            with patch('backend.v3.map_assistant.run_chart_tool',side_effect=trace):
                references=[]
                answer=_request_answer(payload,question,key,references)
            record=json.dumps({'case':case,'turn':turn+1,'question':question,'answer':answer,'queries':queries,
                               'aspect_references':references},ensure_ascii=False)
            if output:
                with output.open('a',encoding='utf-8') as handle: handle.write(record+'\n')
            print(record,flush=True)
            history.extend([{'role':'user','content':question},{'role':'assistant','content':answer[:600],
                                                             'aspect_references':references}])
    print('Live conversations completed. Review continuity, exact pair, and house basis in the outputs.')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live',action='store_true')
    parser.add_argument('--conversation',action='store_true',help='Run three three-turn synthetic conversations (nine billable answers).')
    parser.add_argument('--output',type=Path,help='Write synthetic conversation results to a UTF-8 JSONL file.')
    parser.add_argument('--case',choices=['opposition','trine','house_ingress'],help='Run just one conversation case.')
    args=parser.parse_args()
    if not args.live: parser.error('--live is required (billable answers).')
    local={**dotenv_values(ROOT/'.env'),**dotenv_values(ROOT/'.env.v3.local')}
    key=(os.getenv('OPENAI_TEST_API_KEY') or local.get('OPENAI_TEST_API_KEY') or '').strip()
    if not key: parser.error('OPENAI_TEST_API_KEY is missing. No normal-user key fallback.')
    model=os.getenv('V3_MAP_ASSISTANT_MODEL') or local.get('V3_MAP_ASSISTANT_MODEL')
    if model: os.environ['V3_MAP_ASSISTANT_MODEL']=model
    if args.conversation:
        if args.output:
            args.output.parent.mkdir(parents=True,exist_ok=True)
            args.output.write_text('',encoding='utf-8')
        check_conversations(key,args.output,args.case)
        return
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


if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
