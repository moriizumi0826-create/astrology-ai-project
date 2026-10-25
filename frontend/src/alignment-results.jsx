import React, { useRef, useState } from 'react';
import { ArrowRight, Check, MessageSquarePlus, Pencil } from 'lucide-react';
import { QUESTIONS, answerText } from './alignment-flow.mjs';
import { SECTION_LABELS } from './alignment-session.mjs';
import { ChartFacts } from './alignment-panels.jsx';

const REACTIONS = { add: '補足したい', conditional: '条件を加えたい', different: '違うと感じる' };
const TITLES = { overlap: '重なっているところ', tension: '確かめたいところ', action: '次に試すこと' };

function ResultCard({ section, number, onRevise, busy }) {
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState('add');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef(null), editButtonRef = useRef(null);
  const title = TITLES[section.id];
  const chartLines = section.chartNotes || [];
  const answerLines = section.body;
  const badge = { revised: '見立てを更新', maintained: '維持', uncertain: '要確認' }[section.change];

  async function submit(event) {
    event.preventDefault();
    if (!note.trim() || submitting || busy) return;
    setSubmitting(true); setMessage('');
    try {
      await onRevise({ section: section.id, kind, note: note.trim() });
      setNote(''); setEditing(false); setMessage('補足を踏まえて見立てを更新しました。');
      editButtonRef.current?.focus();
    } catch (error) { setMessage(error.message); }
    finally { setSubmitting(false); }
  }

  return <section className={`al-insight al-insight-${section.id}`} aria-labelledby={`insight-${section.id}`}>
    <header className="al-insight-header"><span className="al-insight-number">{number}</span><h3 id={`insight-${section.id}`}>{title}</h3>{badge && <span className="al-result-badge">{badge}</span>}</header>
    {section.id === 'action' ? <ol className="al-next-steps">{answerLines.map((text, i) => <li key={i}>{text}</li>)}</ol> : <ul className="al-insight-points">{answerLines.map((text, i) => <li key={i}>{text}</li>)}</ul>}
    {chartLines.length > 0 && <div className="al-chart-note"><span className="al-source-label">出生図の手がかり</span>{chartLines.slice(0, 2).map((text, i) => <p key={i}>{text}</p>)}</div>}
    {section.update && <div className="al-personal-note"><span className="al-source-label">あなたの補足</span><blockquote>{section.update.note || 'しっくりくる'}</blockquote></div>}
    {section.changeReason && <p className="al-small">{section.changeReason}</p>}
    <details className="al-evidence"><summary>根拠を見る</summary><ul>{section.evidence.map((text, i) => <li key={i}>{text}</li>)}</ul>{section.original?.length > 0 && <><h4>補足前の整理</h4><ul>{section.original.map((text, i) => <li key={i}>{text}</li>)}</ul></>}</details>
    <div className="al-insight-footer"><button ref={editButtonRef} type="button" disabled={busy} className="al-edit-result" aria-expanded={editing} aria-controls={`edit-${section.id}`} onClick={() => { setEditing(!editing); setMessage(''); }}><MessageSquarePlus size={16} />この項目を補足・訂正する</button><span className="al-result-status" role="status">{message}</span></div>
    {editing && <form id={`edit-${section.id}`} className="al-inline-editor" onSubmit={submit}>
      <h4>「{title}」への補足・訂正</h4>
      <fieldset className="al-feedback-kinds"><legend>どのように伝えますか？</legend>{Object.entries(REACTIONS).map(([value, label]) => <label key={value} className={kind === value ? 'is-selected' : ''}><input type="radio" name={`reaction-${section.id}`} disabled={submitting} value={value} checked={kind === value} onChange={() => setKind(value)} />{label}</label>)}</fieldset>
      <label className="al-field">{kind === 'different' ? '違うと感じた点' : kind === 'conditional' ? '当てはまる条件・当てはまらない条件' : '付け加えたいこと'}<textarea ref={textareaRef} autoFocus rows={3} maxLength={2000} disabled={submitting} required value={note} placeholder="自分の経験や条件を、ひと言でも。" onChange={e => setNote(e.target.value)} /></label>
      <div className="al-editor-actions"><button type="button" className="al-text-button" disabled={submitting} onClick={() => { setEditing(false); editButtonRef.current?.focus(); }}>キャンセル</button><button type="submit" className="al-primary" disabled={!note.trim() || busy || submitting}><Check size={15} />{submitting ? '見立てを更新中…' : 'この項目に反映する'}</button></div>
    </form>}
  </section>;
}

export function AlignmentResults({ answers, supplements, openQuestions, openAnswers, chart, sections, revisions, history, headingRef, busy, onRevise, onEditAnswers, onEditBirth, onEditOpen }) {
  const byId = id => sections.find(section => section.id === id);
  return <div className="al-results">
    <div className="al-results-heading"><h2 id="al-step-title" tabIndex={-1} ref={headingRef}>望みと資質の照らし合わせ</h2><p>いまの望みと経験から、重なる点と確かめたい点を整理しました。</p></div>
    <section className="al-wish-summary" aria-labelledby="wish-title"><div><span className="al-source-label">あなたが望む稼ぎ方</span><h3 id="wish-title">{answerText(QUESTIONS[0], answers)}</h3>{answers.theme?.trim() && <p>大切にしたいこと：<strong>{answers.theme}</strong></p>}</div><button type="button" className="al-secondary" disabled={busy} onClick={onEditAnswers}><Pencil size={15} />回答を変更する</button></section>
    <div className="al-insight-grid">{['overlap', 'tension', 'action'].map((id, i) => <ResultCard key={id} section={byId(id)} number={`0${i + 1}`} onRevise={onRevise} busy={busy} />)}</div>
    <details className="al-result-detail"><summary>回答・出生図の詳細を見る</summary>
      <div className="al-detail-columns"><section><h3>あなたの回答</h3><dl className="al-answer-list">{QUESTIONS.slice(1).map(q => <div key={q.id}><dt>{q.label}</dt><dd>{answerText(q, answers)}</dd>{supplements[q.id] && <dd>補足：{supplements[q.id]}</dd>}</div>)}</dl>{supplements.wish && <p className="al-small">稼ぎ方への補足：{supplements.wish}</p>}</section><section><h3>追加で伝えてくれたこと</h3><dl className="al-answer-list">{openQuestions.map(q => <div key={q.id}><dt>{q.text}</dt><dd>{openAnswers[q.id] || '未回答'}</dd></div>)}</dl></section></div>
      {chart && <ChartFacts chart={chart} />}
      <section className="al-result-limits"><h3>まだ判断できないこと</h3><ul>{byId('unknown').body.map((text, i) => <li key={i}>{text}</li>)}</ul></section>
      <div className="al-editor-actions"><button type="button" className="al-secondary" disabled={busy} onClick={onEditOpen}>追加回答を変更する<ArrowRight size={15} /></button><button type="button" className="al-secondary" disabled={busy} onClick={onEditBirth}>出生情報を変更する<ArrowRight size={15} /></button></div>
    </details>
    {revisions.length > 0 && <details className="al-result-detail"><summary>補足・訂正の履歴を見る（{revisions.length}件）</summary><ol className="al-revision-list">{revisions.map(r => <li key={r.number}><span>{TITLES[r.section] || SECTION_LABELS[r.section]}・{REACTIONS[r.kind] || 'しっくりくる'}</span><p>{r.note || 'しっくりくる'}</p></li>)}</ol>{history.map((h, i) => <details className="al-evidence" key={i}><summary>{i + 1}回目の補足前のまとめ</summary>{h.sections.map(s => <section key={s.id}><h4>{TITLES[s.id] || s.title}</h4><ul>{s.body.map((text, j) => <li key={j}>{text}</li>)}</ul></section>)}</details>)}</details>}
  </div>;
}
