import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {featurePolicy} from '../v3/feature-policy.mjs';

const preview=readFileSync(new URL('../v3/forecast-preview.jsx',import.meta.url),'utf8');
const app=readFileSync(new URL('../v3/app.jsx',import.meta.url),'utf8');
const login=readFileSync(new URL('../v3/login.js',import.meta.url),'utf8');

test('preview uses only responsive screenshots, not paid modules or APIs',()=>{
  assert.match(preview,/<picture>/);
  assert.match(preview,/max-width: 767px/);
  assert.match(preview,/画像内のボタンやカレンダーは操作できません/);
  assert.doesNotMatch(preview,/import.*paid-forecast|postJson|getJson/);
  for(const name of ['desktop','mobile']){
    const bytes=readFileSync(new URL(`../v3/assets/forecast-preview-${name}.jpg`,import.meta.url));
    assert.equal(bytes.subarray(0,3).toString('hex'),'ffd8ff');
  }
});
test('preview CTA follows sign-in state and opens signup directly',()=>{
  assert.match(preview,/Boolean\(session\?\.user_id\)/);
  assert.match(preview,/signedIn \? "\/billing.html" : "\/login.html#signup"/);
  assert.match(login,/location.hash === "#signup" \? "signup" : "login"/);
  assert.match(login,/setMode\(mode\);\s*initialize\(\)/);
});
test('free preview preserves mounted Horoscope and paid access boundary',()=>{
  assert.match(app,/previewOpen && !stellarForecast && <ForecastPreview/);
  assert.match(app,/<div hidden=\{previewOpen && !stellarForecast\}>/);
  assert.match(app,/if \(!paidRequested \|\| !stellarForecast \|\| paidReady\) return/);
  assert.match(app,/stellarForecast && paidRequested/);
  assert.equal(featurePolicy({state:'free',capabilities:{stellar_forecast:true}}).stellarForecast,false);
  assert.equal(featurePolicy({state:'paid',access_source:'invite',capabilities:{stellar_forecast:true}}).stellarForecast,true);
});
