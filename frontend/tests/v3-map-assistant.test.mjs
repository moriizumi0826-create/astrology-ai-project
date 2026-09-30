import test from 'node:test';
import assert from 'node:assert/strict';
import {featurePolicy} from '../v3/feature-policy.mjs';
test('AI free text is restricted to current paid, invite and owner access',()=>{
  for(const session of [null,{state:'anonymous'},{state:'free'}, {state:'paid',valid_until:'2000-01-01'}])assert.equal(featurePolicy(session).mapAssistant,false);
  for(const access_source of ['owner','invite'])assert.equal(featurePolicy({state:'paid',access_source}).mapAssistant,true);
  assert.equal(featurePolicy({state:'paid',access_source:'subscription',valid_until:'2099-01-01'}).mapAssistant,true);
});
