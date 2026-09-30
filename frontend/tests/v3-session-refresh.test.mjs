import test from 'node:test';
import assert from 'node:assert/strict';
import { canRetainSession } from '../v3/session-refresh.mjs';
const session = {user_id:'supabase:test', state:'paid'};
const owner = encodeURIComponent(session.user_id);
test('transient network, timeout and server failures preserve a verified session', () => {
  for (const error of [new TypeError('Failed to fetch'), new TypeError('Load failed'), {name:'RequestTimeoutError'}, {status:503}, {status:429}, {status:408}]) {
    assert.equal(canRetainSession(error, session, owner), true);
  }
});
test('authentication, identity changes, initial load and unexpected failures fail closed', () => {
  for (const error of [{status:401}, {status:403}, {status:400}, new Error('identity changed'), new TypeError('programming error')]) {
    assert.equal(canRetainSession(error, session, owner), false);
  }
  assert.equal(canRetainSession(new TypeError('Failed to fetch'), null, owner), false);
  assert.equal(canRetainSession(new TypeError('Failed to fetch'), session, 'another-user'), false);
});
