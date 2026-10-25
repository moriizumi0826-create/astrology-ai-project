import test from 'node:test';
import assert from 'node:assert/strict';
import { alignmentRequest } from '../v3/alignment-api.mjs';

test('public trial uses the configured V3 origin and never requests an auth session',async()=>{
  const original=globalThis.fetch, originalBase=globalThis.__APP_API_BASE_URL__;
  try {
    globalThis.__APP_API_BASE_URL__='https://v3-api.example';
    let received;
    globalThis.fetch=async(url,options)=>{received={url,options};return new Response(JSON.stringify({ready:true}));};
    assert.deepEqual(await alignmentRequest('/api/alignment/ready',{}),{ready:true});
    assert.equal(received.url,'https://v3-api.example/api/v3/alignment/ready');
    assert.equal(received.options.method,'POST');
    assert.equal(received.options.headers.Authorization,undefined);
    assert.equal(received.options.credentials,undefined);
    for(const path of ['https://unexpected.example','/api/readings','/api/alignment/../readings','/api/alignment/result?api=other']) {
      await assert.rejects(alignmentRequest(path,{}),/Invalid/);
    }
    globalThis.fetch=async()=>new Response(JSON.stringify({detail:'金運AI専用のAPIキーが未設定です。'}),{status:503});
    await assert.rejects(alignmentRequest('/api/alignment/questions',{}),/金運AI専用/);
    globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};
    await assert.rejects(alignmentRequest('/api/alignment/result',{}),/入力は残っています/);
  } finally {
    globalThis.fetch=original;
    if(originalBase===undefined) delete globalThis.__APP_API_BASE_URL__; else globalThis.__APP_API_BASE_URL__=originalBase;
  }
});
