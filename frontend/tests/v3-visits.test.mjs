import test from 'node:test';
import assert from 'node:assert/strict';
import { trackVisit, japanVisitDate } from '../v3/visits.mjs';

function setup() {
  const data = new Map();
  const ids = [];
  const options = {
    production: true,
    storage: { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) },
    crypto: { randomUUID: () => 'f37a8ec9-c8a7-4bc9-95e8-c0d680c33eb9' },
    send: async id => { ids.push(id); return true; },
    now: new Date('2026-10-20T14:59:00Z'),
  };
  return { data, ids, options };
}

test('same browser is sent once per JST day across pages; next day reuses id', async () => {
  const { ids, options } = setup();
  await trackVisit(options); await trackVisit(options);
  assert.equal(ids.length, 1);
  await trackVisit({ ...options, now: new Date('2026-10-20T15:00:00Z') });
  assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]);
  assert.equal(japanVisitDate(options.now), '2026-10-20');
});

test('local/preview and do-not-track do not count', async () => {
  const { ids, data, options } = setup();
  await trackVisit({ ...options, production: false });
  await trackVisit({ ...options, doNotTrack: true });
  assert.equal(ids.length, 0); assert.equal(data.size, 0);
});

test('network failure is silent and retryable; blocked storage is harmless', async () => {
  const { ids, options } = setup();
  await trackVisit({ ...options, send: async () => { throw Error('offline'); } });
  await trackVisit(options); assert.equal(ids.length, 1);
  await trackVisit({ ...options, storage: { getItem() { throw Error('blocked'); } } });
});
