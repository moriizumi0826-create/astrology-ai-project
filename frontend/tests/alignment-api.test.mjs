import test from 'node:test';
import assert from 'node:assert/strict';
import { alignmentRequest } from '../src/alignment-api.mjs';

test('chart transport sends JSON, surfaces server errors, rejects HTML and network failures', async () => {
  const original = globalThis.fetch;
  try {
    let received;
    globalThis.fetch = async (url, options) => { received = { url, options }; return new Response(JSON.stringify({ planets: [] })); };
    assert.deepEqual(await alignmentRequest('/api/alignment/chart', { birth_date: '2000-01-01' }), { planets: [] });
    assert.equal(received.url, '/api/alignment/chart');
    assert.equal(received.options.method, 'POST');
    assert.equal(JSON.parse(received.options.body).birth_date, '2000-01-01');
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: '時刻を確認してください' }), { status: 422 });
    await assert.rejects(alignmentRequest('/api/alignment/chart', {}), /時刻を確認/);
    globalThis.fetch = async () => new Response('<html>static host</html>');
    await assert.rejects(alignmentRequest('/api/alignment/chart', {}), /正しい応答がありません/);
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(alignmentRequest('/api/alignment/chart', {}), /接続できません/);
  } finally { globalThis.fetch = original; }
});
