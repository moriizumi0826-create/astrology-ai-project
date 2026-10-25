import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '../src/alignment-flow.mjs';
import { PREFECTURES } from '../src/alignment-prefectures.mjs';
import { FORMAT, EMPTY_BIRTH, followups, reflect, restoreSession, birthPayload } from '../src/alignment-session.mjs';

test('followups adapt to product and boundary answers, stay bounded and skip compatible', () => {
  assert.deepEqual(followups({ wish: ['product'], value: ['change'] }).map(q => q.id), ['product', 'boundary']);
  assert.deepEqual(followups({ wish: ['expertise'], offer: ['partner'] }).map(q => q.id), ['motivation', 'delivery']);
  assert.equal(followups({}).length, 2);
});
test('unknown and missing are not negative evidence; no chart means no chart conclusion', () => {
  const sections = reflect({ wish: ['product'], interest: ['unknown'] }, null);
  assert.doesNotMatch(sections.find(s => s.id === 'overlap').body.join(''), /重なっています/);
  assert.match(sections.find(s => s.id === 'unknown').body[0], /未計算/);
});
test('wish versus delivery tension is conditional, not an aptitude failure', () => {
  const sections = reflect({ wish: ['product'], interest: ['make'], offer: ['avoid'] }, null);
  assert.match(sections.find(s => s.id === 'overlap').body[0], /重なっています/);
  assert.match(sections.find(s => s.id === 'tension').body[0], /工程を分けて/);
});
test('wanting change and respecting choice can coexist; correction suspends only target', () => {
  const a = { value: ['change'], boundary: ['limit'] };
  const before = reflect(a, null);
  assert.match(before.find(s => s.id === 'overlap').body.join(''), /両立/);
  const after = reflect(a, null, [{ section: 'tension', kind: 'different', note: '対応範囲は決めています' }]);
  assert.match(after.find(s => s.id === 'tension').body[0], /保留/);
  assert.deepEqual(after.find(s => s.id === 'overlap').body, before.find(s => s.id === 'overlap').body);
  assert.equal(after.find(s => s.id === 'tension').update.note, '対応範囲は決めています');
});
test('birth payload requires time and uses prefectural capital coordinates, default Tokyo', () => {
  const b = { ...EMPTY_BIRTH, date: '1984-08-26', time: '19:20' };
  assert.equal(birthPayload(b, '2026-10-25').birth_time, '19:20');
  assert.match(birthPayload(b, '2026-10-25').birthplace, /東京都.*新宿区/);
  assert.equal(birthPayload(b, '2026-10-25').longitude, 139.69167);
  const saitama = birthPayload({ ...b, prefecture: '埼玉県', latitude: 0, longitude: 0 }, '2026-10-25');
  assert.match(saitama.birthplace, /さいたま市/);
  assert.equal(saitama.latitude, 35.85694);
  assert.equal(PREFECTURES.length, 47);
  assert.equal(new Set(PREFECTURES.map(p => p.name)).size, 47);
  for (const p of PREFECTURES) assert.equal(birthPayload({ ...b, prefecture: p.name }, '2026-10-25').birth_time_unknown, false);
  for (const patch of [{ time: '' }, { unknownTime: true }, { prefecture: 'invalid' }]) assert.throws(() => birthPayload({ ...b, ...patch }, '2026-10-25'));
});
test('restore sanitizes choices, restores notes/history, never trusts saved chart as calculated', () => {
  const restored = restoreSession({ format: FORMAT, answers: { wish: ['product', 'injected'], interest: ['unknown', 'make'], theme: '<script>text</script>' }, birth: { unknownTime: 'false' },
    revisions: [{ section: 'tension', kind: 'different', note: '条件あり' }, { section: '__proto__', kind: 'add', note: 'x' }],
    openAnswers: { product: '自由記述' }, history: [{ at: 'bad', sections: [{ id: 'wish', title: 'untrusted', body: ['元のまとめ'] }] }], chart: { planets: ['fake'] } });
  assert.deepEqual(restored.answers.wish, ['product']);
  assert.deepEqual(restored.answers.interest, ['unknown']);
  assert.equal(restored.revisions.length, 1);
  assert.equal(restored.history[0].sections[0].title, 'あなたが望んでいること');
  assert.equal(restored.openAnswers.product, '自由記述');
  assert.equal(restored.chart, null);
  assert.equal(restored.birth.prefecture, '東京都');
  assert.throws(() => restoreSession({ format: 'other' }));
});
test('restore resumes exact stage and draft feedback; incomplete required answers return to questions', () => {
  const answers = Object.fromEntries(QUESTIONS.map(q => [q.id, q.text ? 'テーマ' : [q.options[0][0]]]));
  const restored = restoreSession({ format: FORMAT, phase: 'open', index: 7, openIndex: 1, answers,
    feedback: '書きかけの補足', feedbackSection: 'overlap', feedbackKind: 'conditional' });
  assert.equal(restored.phase, 'birth');
  assert.equal(restored.openIndex, 1);
  assert.equal(restored.feedback, '書きかけの補足');
  const incomplete = restoreSession({ format: FORMAT, phase: 'summary', answers: { ...answers, interest: [] } });
  assert.equal(incomplete.phase, 'questions');
  assert.equal(incomplete.index, 1);
});
