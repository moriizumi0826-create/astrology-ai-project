import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUESTIONS, OPEN_QUESTIONS, selectAnswer, canContinue, answerText, validateBirth, recordRevision } from '../src/alignment-flow.mjs';

test('temporary questions have unique ids and an explicit unknown option', () => {
  assert.equal(new Set(QUESTIONS.map(q => q.id)).size, QUESTIONS.length);
  for (const q of QUESTIONS.filter(q => !q.text)) {
    assert.ok(q.options.some(([id]) => id === 'unknown'));
    assert.equal(new Set(q.options.map(([id]) => id)).size, q.options.length);
  }
  assert.ok(OPEN_QUESTIONS.length <= 3);
});
test('single choice replaces previous selection', () => assert.deepEqual(selectAnswer(['product'], 'expertise'), ['expertise']));
test('multiple choice toggles, unknown is exclusive', () => {
  assert.deepEqual(selectAnswer(['explore'], 'make', true), ['explore', 'make']);
  assert.deepEqual(selectAnswer(['explore'], 'explore', true), []);
  assert.deepEqual(selectAnswer(['explore'], 'unknown', true), ['unknown']);
  assert.deepEqual(selectAnswer(['unknown'], 'make', true), ['make']);
});
test('unanswered is not treated as no; free text can be skipped', () => {
  assert.equal(canContinue(QUESTIONS[0], undefined), false);
  assert.equal(canContinue(QUESTIONS[0], ['unknown']), true);
  assert.equal(canContinue(QUESTIONS.at(-1), ''), true);
  assert.equal(answerText(QUESTIONS[0], {}), '未回答');
  assert.equal(answerText(QUESTIONS.at(-1), {}), '未記入');
});
test('birth validation permits unknown time but rejects impossible dates and missing place', () => {
  const valid = { date: '1984-08-26', time: '19:20', place: '川口市', unknownTime: false };
  assert.equal(validateBirth(valid, '2026-10-25'), '');
  assert.equal(validateBirth({ ...valid, time: '', unknownTime: true }, '2026-10-25'), '');
  for (const patch of [{ date: '2026-02-30' }, { date: '2027-01-01' }, { time: '' }, { place: '  ' }]) {
    assert.ok(validateBirth({ ...valid, ...patch }, '2026-10-25'));
  }
});
test('corrections append immutable history and ignore empty notes', () => {
  const first = recordRevision([], '  深追いはしない  ');
  const second = recordRevision(first, '範囲を先に決めたい');
  assert.equal(first.length, 1);
  assert.equal(second.length, 2);
  assert.equal(second[0].note, '深追いはしない');
  assert.equal(second[1].number, 2);
  assert.equal(recordRevision(second, '  '), second);
});
test('LP and relative build entry exist; no authentication or unsafe HTML rendering', () => {
  const entry = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../vite.config.mjs', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/alignment.jsx', import.meta.url), 'utf8');
  assert.match(entry, /href="\.\/alignment\.html"/);
  assert.match(config, /alignment: path\.resolve/);
  assert.doesNotMatch(app, /href="\/(?!\/)/);
  assert.doesNotMatch(app, /prepareSession|dangerouslySetInnerHTML/);
  assert.match(app, /AIは未接続/);
});
