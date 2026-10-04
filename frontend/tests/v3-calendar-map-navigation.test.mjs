import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarMapNavigation,eventAssistantNotice,eventAssistantQuestions,mapAssistantHistory} from '../v3/calendar-map-navigation.mjs';
import FAQ from '../v3/map-assistant-faq.json' with {type:'json'};
import {buildMapAssistantContext} from '../v3/map-assistant-context.mjs';

test('UTC event preserves exact second and local date rollover',()=>{
  const e=calendarMapNavigation({title:'満月',event_type:'full_moon',event_utc_datetime:'2026-10-04T18:54:13Z'},'Asia/Tokyo');
  assert.equal(e.date,'2026-10-05'); assert.equal(e.time,'03:54:13'); assert.equal(e.utc_datetime,'2026-10-04T18:54:13.000Z'); assert.equal(e.approximate,false);
});
test('same local clock during DST preserves distinct absolute instants',()=>{
  const events=['2026-11-01T05:30:00Z','2026-11-01T06:30:00Z'].map(event_utc_datetime=>calendarMapNavigation({event_utc_datetime},'America/New_York'));
  assert.equal(events[0].time,events[1].time); assert.notEqual(events[0].utc_datetime,events[1].utc_datetime);
});
test('missing time uses noon and explicitly labels approximation',()=>{
  const e=calendarMapNavigation({title:'イベント',event_date:'2026-10-04'},'Asia/Tokyo');
  assert.equal(e.time,'12:00'); assert.equal(e.approximate,true); assert.match(eventAssistantNotice(e),/正午の参考配置/);
});
test('legacy local timestamps remain local and invalid dates fail',()=>{
  assert.equal(calendarMapNavigation({event_datetime:'2026-10-04T07:54:13'},'Asia/Tokyo').time,'07:54:13');
  assert.equal(calendarMapNavigation({event_datetime:'2026-10-04T07:54:00'},'Asia/Tokyo').time,'07:54');
  for(const event of [{event_date:'2026-02-30'},{event_datetime:'invalid'},{event_datetime:'2026-10-04T25:00:00'}])assert.throws(()=>calendarMapNavigation(event,'Asia/Tokyo'));
});
test('local event notices never consume history; normal conversation remains',()=>{
  assert.deepEqual(mapAssistantHistory([{role:'user',content:'質問'},{role:'assistant',content:'古い満月',eventNotice:true},{role:'assistant',content:'回答'}]),[{role:'user',content:'質問'},{role:'assistant',content:'回答'}]);
});
test('event context is compact and absent after clearing; no notes or personal fields',()=>{
  const selectedEvent=calendarMapNavigation({title:'満月',event_type:'full_moon',event_datetime:'2026-10-04T07:54:13+09:00',note:'private'},'Asia/Tokyo');
  assert.deepEqual(Object.keys(buildMapAssistantContext({selectedEvent}).selected_event).sort(),['approximate','date','time','title','type']);
  assert.equal(buildMapAssistantContext({}).selected_event,undefined);
});
test('each event type has three distinct AI questions, separate from fixed FAQs',()=>{
  for(const type of ['full_moon','new_moon','sign_ingress','natal_house_ingress','transit_natal_aspect','retrograde_start','direct_start','unknown']) {
    const questions=eventAssistantQuestions({type});
    assert.equal(questions.length,3); assert.equal(new Set(questions).size,3);
    for(const question of questions){assert.ok(question.length<500);assert.equal(Object.hasOwn(FAQ,question),false);}
  }
  assert.deepEqual(eventAssistantQuestions(null),[]);
});
test('lunations and motion transitions name the actual event',()=>{
  assert.match(eventAssistantQuestions({type:'full_moon'})[0],/この満月/);
  assert.match(eventAssistantQuestions({type:'new_moon'})[0],/この新月/);
  assert.match(eventAssistantQuestions({type:'retrograde_start'})[0],/この逆行/);
  assert.match(eventAssistantQuestions({type:'direct_start'})[0],/この順行/);
});
