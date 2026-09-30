import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { initialBirthData, editableBirthData, buildReadingRequest } from "../v3/birth-data.mjs";
const read = name => readFileSync(new URL(`../v3/${name}`,import.meta.url),'utf8');
test('Horoscope recalculation does not overwrite member or forecast storage', async () => {
  const app=read('app.jsx');
  const body=app.match(/const recalculate = async \(\{ request, snapshot \}\) => \{([\s\S]*?)\n  \};/)[1];
  let form, result;
  const ctx=vm.createContext({ postJson:async()=>({chart:'other'}),setChartForm:x=>form=x,setResult:x=>result=x,setRevision:()=>{},freeResult:x=>x });
  await vm.runInContext(`(async()=>{const request={},snapshot={full_name:'別人'};${body}})()`,ctx);
  assert.equal(form.full_name,'別人');assert.equal(result.chart,'other');
  assert.doesNotMatch(body,/saveMemberProfile|storeReadingForm|storeReadingResult/);
  assert.match(app,/birthForm=\{chartForm\}/);
  const map=read('horoscope-map.jsx');
  assert.equal((map.match(/birthForm \|\| getQueryReadingForm\(\) \|\| getStoredReadingForm\(\)/g)||[]).length,2);
});
test('account validates before saving and only updates local state after successful save', async () => {
  const body=read('account-birth-editor.jsx').match(/onRecalculate=\{async \(\{ request, snapshot \}\) => \{([\s\S]*?)\n    \}\}/)[1];
  for(const fail of [false,true]) {
    const calls=[];
    const ctx=vm.createContext({ postJson:async()=>calls.push('validate'),saveMemberProfile:async()=>{calls.push('save');if(fail)throw Error('conflict');},storeReadingForm:()=>calls.push('local'),clearReadingResult:()=>calls.push('clear'),onSaved:()=>calls.push('notify'),render:()=>{},savedForm:null });
    const run=vm.runInContext(`(async()=>{const request={},snapshot={};${body}})()`,ctx);
    if(fail)await assert.rejects(run,/conflict/);else await run;
    assert.deepEqual(calls,fail?['validate','save']:['validate','save','local','clear','notify']);
  }
});
test('LP removes save copy while retaining its original save behavior',()=>{
  assert.doesNotMatch(read('entry.js'),/entry-member-notice|アカウントへ保存/);
  assert.match(read('entry-form.js'),/saveMemberProfile/);
  assert.match(read('account.html'),/id="profile-editor"/);
  assert.match(read('birth-data-editor.jsx'),/別の出生データでチャートを見る/);
});
test('saved profiles without a separate prefecture can be edited without another location search',()=>{
  const saved={full_name:'本人',birth_date:'1990-01-01',birth_time:'12:00',birthplace:'Tokyo, Japan',latitude:35.68,longitude:139.76,timezone_name:'Asia/Tokyo'};
  const form=initialBirthData(saved,{birthplace:saved.birthplace});
  form.full_name='修正済み';
  assert.equal(buildReadingRequest(form).birthplace,'Tokyo, Japan');
});
test('V3 editors require explicit time and never silently convert legacy unknown time to noon',()=>{
  const form=editableBirthData({full_name:'本人',birth_date:'1990-01-01',birth_time:'12:00',birth_time_unknown:true,latitude:35.68,longitude:139.76,timezone_name:'Asia/Tokyo'},{birthplace:'Tokyo'});
  assert.equal(form.birth_time,'');assert.equal(form.birth_time_unknown,false);
  assert.throws(()=>buildReadingRequest(form),/出生時刻/);
  form.birth_time='12:00';assert.equal(buildReadingRequest(form).birth_time,'12:00');
  assert.doesNotMatch(read('entry.html'),/id="birth-time-unknown"/);
  assert.doesNotMatch(read('birth-data-editor.jsx'),/type="checkbox"/);
  for(const name of ['entry.html','birth-data-editor.jsx'])assert.match(read(name),/仮に12:00と入力してください/);
});
