import test from 'node:test';
import assert from 'node:assert/strict';
import {appendNoteDraft,orderedNoteTargets} from '../v3/calendar-note-merge.mjs';
test('append keeps existing identity/date/revision and does not trim content',()=>{
  const target={id:'old',revision:7,note_date:'2026-09-29',content:'以前のメモ'};
  const incoming={note_date:'2026-09-30',content:'新しい回答'};
  assert.deepEqual(appendNoteDraft(target,incoming),{...target,content:'以前のメモ\n\n新しい回答'});
  assert.equal(target.content,'以前のメモ');
  assert.equal(incoming.content,'新しい回答');
  assert.equal(Array.from(appendNoteDraft({...target,content:'星'.repeat(999)},incoming).content).length>1000,true);
});
test('same day first, then newest date without mutating input',()=>{
  const notes=[{id:'a',note_date:'2026-09-28'},{id:'b',note_date:'2026-10-01'},{id:'c',note_date:'2026-09-30'}];
  assert.deepEqual(orderedNoteTargets(notes,'2026-09-30').map(n=>n.id),['c','b','a']);
  assert.equal(notes[0].id,'a');
});
