import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMapAssistantContext, compactBirth} from '../v3/map-assistant-context.mjs';
test('only compact allowed birth fields are sent, with account/chart kept separate',()=>{
  const data=buildMapAssistantContext({memberForm:{birth_date:'2000-01-01',birth_time:'12:34:00',timezone_name:'Asia/Tokyo',timezone_offset:9,full_name:'secret',email:'secret',birthplace:'secret',latitude:35},chartForm:{birth_date:'1990-02-03'}});
  assert.deepEqual(data.member_birth,{date:'2000-01-01',time:'12:34',timezone:'Asia/Tokyo',utc_offset:9});
  assert.equal(data.chart_birth.date,'1990-02-03');
  assert.equal(JSON.stringify(data).includes('secret'),false);
  assert.equal(compactBirth(null),undefined);
});
test('line endpoints distinguish natal/transit and remove duplicate compound edges',()=>{
  const data=buildMapAssistantContext({aspects:[
    {scope:'transitTransit',transitPlanet:'SUN',transitPlanetB:'MOON',angle:90,orb:0.1234,description:'do not send'},
    {scope:'transitTransit',transitPlanet:'MOON',transitPlanetB:'SUN',angle:90,orb:0.1234},
    {scope:'natalNatal',natalPlanet:'SUN',natalPlanetB:'MOON',angle:120,orb:1},
    {natalPlanet:'VENUS',transitPlanet:'MARS',angle:60,orb:2},
  ]});
  assert.deepEqual(data.aspects,[['T:MOON','T:SUN',90,0.12],['N:SUN','N:MOON',120,1],['N:VENUS','T:MARS',60,2]]);
  assert.equal(data.aspects_total,3);
  assert.equal(JSON.stringify(data).includes('do not send'),false);
});
test('selected line wins the 24-row budget; omitted count is explicit',()=>{
  const aspects=Array.from({length:40},(_,i)=>({natalPlanet:'SUN',transitPlanet:`P${i}`,angle:90,orb:i/10}));
  const data=buildMapAssistantContext({aspects,isSelected:a=>a.transitPlanet==='P39'});
  assert.equal(data.aspects.length,24);
  assert.equal(data.aspects[0][1],'T:P39');
  assert.equal(data.aspects_omitted,16);
  assert.match(data.selected_aspect,/P39/);
});
test('no lines remains empty; positions omit estimated values and round precision',()=>{
  const data=buildMapAssistantContext({natal:[{planet:'SUN',longitude:123.4567}],transits:[{planet:'MOON',longitude:20,estimated:true}]});
  assert.deepEqual(data.aspects,[]);
  assert.deepEqual(data.positions,[['N:SUN',123.46]]);
});
