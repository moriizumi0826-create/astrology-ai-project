export function appendNoteDraft(note, incoming) {
  return {...note, content:[note.content, incoming.content].filter(Boolean).join('\n\n')};
}
export function orderedNoteTargets(notes, date) {
  return [...notes].sort((a,b)=>Number(b.note_date===date)-Number(a.note_date===date) || b.note_date.localeCompare(a.note_date) || a.id.localeCompare(b.id));
}
