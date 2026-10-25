import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, DIMENSIONS, QUESTION_VERSION, answerText, canContinue } from '../src/alignment-work-style.mjs';

test('24 shared questions cover all seven perspectives without free-text gates',()=>{
  assert.equal(QUESTION_VERSION,'work-style-3');
  assert.equal(QUESTIONS.length,24);
  assert.equal(new Set(QUESTIONS.map(q=>q.id)).size,24);
  for(const dimension of DIMENSIONS) assert.equal(QUESTIONS.filter(q=>q.dimension===dimension.id).length,3);
  for(const q of QUESTIONS) {
    assert.ok(q.options.some(([id])=>id==='unknown'));
    assert.ok(canContinue(q,['unknown']));
    assert.ok(answerText(q,{[q.id]:['unknown']}));
  }
});
