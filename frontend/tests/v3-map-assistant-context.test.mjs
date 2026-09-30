import test from 'node:test';
import assert from 'node:assert/strict';
import {buildMapAssistantContext, compactBirth, assistantHouse} from '../v3/map-assistant-context.mjs';
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

test('Virgo solar chart puts Leo Mars in house12, separately from actual houses',()=>{
  const data=buildMapAssistantContext({planetMode:'transit',natal:[{planet:'SUN',longitude:155}],transits:[{planet:'MARS',longitude:125}],
    natalCusps:Array.from({length:12},(_,i)=>(90+i*30)%360),transitCusps:Array.from({length:12},(_,i)=>(120+i*30)%360)});
  assert.deepEqual(data.positions,[['T:MARS',125]]);
  assert.deepEqual(data.houses,[['T:MARS',4,2,1,12]]);
  assert.equal(data.chart_natal_sun_sign,5);
  assert.equal(data.planet_mode,'transit');
});

test('natal/transit menus select rows but visible line endpoints are retained',()=>{
  const base={natal:[{planet:'SUN',longitude:155},{planet:'MOON',longitude:10}],transits:[{planet:'MARS',longitude:125},{planet:'JUPITER',longitude:220}]};
  assert.deepEqual(buildMapAssistantContext({...base,planetMode:'natal'}).positions.map(r=>r[0]),['N:SUN','N:MOON']);
  assert.equal(buildMapAssistantContext(base).positions.length,4);
  const data=buildMapAssistantContext({...base,planetMode:'natal',aspects:[{scope:'transitNatal',natalPlanet:'SUN',transitPlanet:'MARS',angle:30}]});
  assert.deepEqual(data.positions.map(r=>r[0]),['N:SUN','N:MOON','T:MARS']);
});

test('missing or invalid cusps never produce fabricated houses, or solar without real Sun',()=>{
  const data=buildMapAssistantContext({natal:[{planet:'SUN',longitude:155,estimated:true}],transits:[{planet:'MARS',longitude:125}],natalCusps:[0,30],transitCusps:Array(12).fill(null)});
  assert.deepEqual(data.houses,[['T:MARS',4,null,null,null]]);
  assert.equal(data.chart_natal_sun_sign,null);
  assert.equal(assistantHouse(20,Array(12).fill(0)),null);
});

test('cusp wrapping and raw sign boundaries are not affected by rounded longitude',()=>{
  const cusps=Array.from({length:12},(_,i)=>(350+30*i)%360);
  assert.equal(assistantHouse(0,cusps),1);
  assert.equal(assistantHouse(20,cusps),2);
  assert.equal(assistantHouse(349.99,cusps),12);
  const data=buildMapAssistantContext({transits:[{planet:'MARS',longitude:149.99999}],natal:[{planet:'SUN',longitude:150}]});
  assert.deepEqual(data.houses.find(row=>row[0]==='T:MARS'),['T:MARS',4,null,null,12]);
});
