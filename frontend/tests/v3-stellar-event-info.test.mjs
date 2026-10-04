import test from 'node:test';
import assert from 'node:assert/strict';
import {stellarEventInfo} from '../v3/stellar-event-info.mjs';
const remaining={value:3,unit:'時間'};
test('house uses natal basis and never invents previous house',()=>{
  const info=stellarEventInfo({event_type:'natal_house_ingress',planet:'MOON',house:6},remaining);
  assert.equal(info.label,'移動まで');assert.equal(info.description,'約3時間後、月が出生図基準の第6ハウスへ移動します。');
  assert.match(stellarEventInfo({event_type:'natal_house_ingress',planet:'MOON',house:6,previous_house:5},remaining).description,/第5ハウスから第6ハウス/);
});
test('aspect clarifies exactness not duration',()=>{
  const info=stellarEventInfo({event_type:'transit_natal_aspect',planet:'MARS',natal_planet:'SUN'},remaining);
  assert.equal(info.label,'ピークまで');assert.match(info.description,/火星と出生図の太陽/);assert.match(info.description,/この瞬間だけに限られるわけではありません/);
});
test('lunations and motion changes name their target',()=>{
  for(const [type,label] of [['new_moon','新月まで'],['full_moon','満月まで'],['retrograde_start','逆行開始まで'],['direct_start','順行開始まで']])assert.equal(stellarEventInfo({event_type:type},remaining).label,label);
  assert.match(stellarEventInfo({event_type:'sign_ingress',planet:'VENUS',sign:'天秤座'},remaining).description,/金星が天秤座へ移動します/);
});
test('completed uses past tense and local event time',()=>{
  const info=stellarEventInfo({event_type:'full_moon',event_datetime:'2026-10-04T23:00:00Z'},remaining,true,'Asia/Tokyo');
  assert.equal(info.label,'満月通過');assert.match(info.description,/2026\/10\/5 08:00に、満月の瞬間を迎えました/);assert.doesNotMatch(info.description,/3時間後/);
});
