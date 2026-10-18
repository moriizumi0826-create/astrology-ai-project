import test from 'node:test';
import assert from 'node:assert/strict';
import {isRetrograde,retrogradeSuffix,playbackMotion,drawRetrogradeMarker} from '../v3/retrograde.mjs';
test('retrograde flags are explicit and never inferred for estimated positions',()=>{
  for(const retrograde of [true,1,'1','true','R','逆行']) assert.equal(isRetrograde({retrograde}),true);
  for(const retrograde of [false,0,'false','0',undefined,null]) assert.equal(isRetrograde({retrograde}),false);
  assert.equal(isRetrograde({retrograde:true,estimated:true}),false);
  assert.equal(retrogradeSuffix({retrograde:true}),'〔逆行〕');
  assert.equal(retrogradeSuffix({retrograde:false}),'');
});
test('playback uses the current frame motion until the next frame is reached',()=>{
  const from={transits:[{planet:'MERCURY',retrograde:true}]},to={transits:[{planet:'MERCURY',retrograde:false}]};
  assert.equal(playbackMotion(from,to,'MERCURY',0),true);
  assert.equal(playbackMotion(from,to,'MERCURY',0.99),true);
  assert.equal(playbackMotion(from,to,'MERCURY',1),false);
  assert.equal(playbackMotion(to,from,'MERCURY',1),true);
  assert.equal(playbackMotion(from,to,'VENUS',0),false);
});
test('map marker is a small orange R in the upper-right of the symbol canvas',()=>{
  const calls=[],ctx={strokeText:(...args)=>calls.push(args),fillText:(...args)=>calls.push(args)};
  drawRetrogradeMarker(ctx);
  assert.deepEqual(calls,[['R',150,30],['R',150,30]]);
  assert.equal(ctx.fillStyle,'#ffb066');
});
