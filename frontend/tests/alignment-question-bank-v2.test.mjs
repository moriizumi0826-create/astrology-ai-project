import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, COMMON_QUESTIONS, questionsFor, selectedModules, selectChoice } from '../src/alignment-question-bank-v2.mjs';

test('bank covers seven perspectives with three distinct questions each', () => {
  assert.equal(COMMON_QUESTIONS.length, 6);
  assert.equal(MODULES.length, 7);
  const all = [...COMMON_QUESTIONS, ...MODULES.flatMap(module => module.questions)];
  assert.equal(all.length, 27);
  assert.equal(new Set(all.map(q => q.id)).size, all.length);
  for (const module of MODULES) assert.equal(module.questions.length, 3);
  for (const q of all) {
    assert.equal(new Set(q.options.map(([id]) => id)).size, q.options.length);
    assert.ok(q.options.some(([id]) => id === 'unknown'));
    assert.ok(q.purpose && q.allowSupplement);
  }
});

test('every pair routes only the selected perspectives and caps the interview at twelve', () => {
  for (const first of MODULES) for (const second of MODULES) {
    const answers = { 'common.primary': [first.id], 'common.secondary': [second.id] };
    assert.deepEqual(selectedModules(answers).map(m => m.id), [...new Set([first.id, second.id])]);
    assert.equal(questionsFor(answers).length, first === second ? 9 : 12);
  }
});

test('uncertainty and skipping do not invent a route; stray answers cannot route', () => {
  assert.equal(questionsFor({}).length, 6);
  assert.equal(questionsFor({ 'common.primary': ['unknown'], 'common.secondary': ['skip'] }).length, 6);
  assert.equal(questionsFor({ 'common.primary': ['resources'], 'common.secondary': ['skip'] }).length, 9);
  assert.equal(selectedModules({ 'resources.offer': ['skill'], 'common.primary': ['invented'] }).length, 0);
  assert.equal(selectedModules({ 'common.primary': ['daily', 'role'] }).length, 0);
});

test('unknown and lack of experience remain separate exclusive answers', () => {
  const q = MODULES[0].questions[1];
  assert.deepEqual(selectChoice(q, ['paid'], 'unexperienced'), ['unexperienced']);
  assert.deepEqual(selectChoice(q, ['unexperienced'], 'unknown'), ['unknown']);
  assert.deepEqual(selectChoice(q, ['unknown'], 'thanks'), ['thanks']);
  assert.deepEqual(selectChoice(q, ['thanks'], 'paid'), ['thanks', 'paid']);
  assert.throws(() => selectChoice(q, [], 'invented'));
});
