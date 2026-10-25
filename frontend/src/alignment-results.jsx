import React, { useRef, useState } from 'react';
import { ArrowRight, Check, MessageSquarePlus, Pencil } from 'lucide-react';
import { QUESTIONS, answerText } from './alignment-flow.mjs';
import { SECTION_LABELS } from './alignment-session.mjs';
import { ChartFacts } from './alignment-panels.jsx';

const REACTIONS = { add: '補足したい', conditional: '条件を加えたい', different: '違うと感じる' };
const TITLES = { overlap: '重なっているところ', tension: '確かめたいところ', action: '次に試すこと' };

function ResultCard({ section, number, onRevise, busy, compact = false }) {
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

  return <section className={compact ? 'al-quick-revision' : `al-insight al-insight-${section.id}`} aria-label={compact ? '結果への補足' : undefined} aria-labelledby={compact ? undefined : `insight-${section.id}`}>
    {!compact && <><header className="al-insight-header"><span className="al-insight-number">{number}</span><h3 id={`insight-${section.id}`}>{title}</h3>{badge && <span className="al-result-badge">{badge}</span>}</header>
    {section.id === 'action' ? <ol className="al-next-steps">{answerLines.map((text, i) => <li key={i}>{text}</li>)}</ol> : <ul className="al-insight-points">{answerLines.map((text, i) => <li key={i}>{text}</li>)}</ul>}
    {chartLines.length > 0 && <div className="al-chart-note"><span className="al-source-label">出生図の手がかり</span>{chartLines.slice(0, 2).map((text, i) => <p key={i}>{text}</p>)}</div>}
    {section.update && <div className="al-personal-note"><span className="al-source-label">あなたの補足</span><blockquote>{section.update.note || 'しっくりくる'}</blockquote></div>}
    {section.changeReason && <p className="al-small">{section.changeReason}</p>}
    <details className="al-evidence"><summary>根拠を見る</summary><ul>{section.evidence.map((text, i) => <li key={i}>{text}</li>)}</ul>{section.original?.length > 0 && <><h4>補足前の整理</h4><ul>{section.original.map((text, i) => <li key={i}>{text}</li>)}</ul></>}</details></>}
    <div className="al-insight-footer"><button ref={editButtonRef} type="button" disabled={busy} className="al-edit-result" aria-expanded={editing} aria-controls={`edit-${compact ? 'quick-' : ''}${section.id}`} onClick={() => { setEditing(!editing); setMessage(''); }}><MessageSquarePlus size={16} />{compact ? '補足して、見立てを更新する' : 'この項目を補足・訂正する'}</button><span className="al-result-status" role="status">{message}</span></div>
    {editing && <form id={`edit-${compact ? 'quick-' : ''}${section.id}`} className="al-inline-editor" onSubmit={submit}>
      <h4>「{title}」への補足・訂正</h4>
      <fieldset className="al-feedback-kinds"><legend>どのように伝えますか？</legend>{Object.entries(REACTIONS).map(([value, label]) => <label key={value} className={kind === value ? 'is-selected' : ''}><input type="radio" name={`reaction-${compact ? 'quick-' : ''}${section.id}`} disabled={submitting} value={value} checked={kind === value} onChange={() => setKind(value)} />{label}</label>)}</fieldset>
      <label className="al-field">{kind === 'different' ? '違うと感じた点' : kind === 'conditional' ? '当てはまる条件・当てはまらない条件' : '付け加えたいこと'}<textarea ref={textareaRef} autoFocus rows={3} maxLength={2000} disabled={submitting} required value={note} placeholder="自分の経験や条件を、ひと言でも。" onChange={e => setNote(e.target.value)} /></label>
      <div className="al-editor-actions"><button type="button" className="al-text-button" disabled={submitting} onClick={() => { setEditing(false); editButtonRef.current?.focus(); }}>キャンセル</button><button type="submit" className="al-primary" disabled={!note.trim() || busy || submitting}><Check size={15} />{submitting ? '見立てを更新中…' : 'この項目に反映する'}</button></div>
    </form>}
  </section>;
}

export function AlignmentResults({ answers, supplements, openQuestions, openAnswers, chart, sections, scores, revisions, history, headingRef, busy, onRevise, onEditAnswers, onEditBirth, onEditOpen }) {
  const byId = id => sections.find(section => section.id === id);
  return <div className="al-results">
    <div className="al-results-heading"><h2 id="al-step-title" tabIndex={-1} ref={headingRef}>あなたの「やりたい」を、どう生かす？</h2></div>
    <section className="al-score-hero" aria-label="今回の結果">
      <div className="al-score-top"><div className="al-score-dial" style={{ '--score': `${scores?.total ?? 0}%` }}><div><span>{scores?.scoreLabel || '重なりスコア'}</span><strong>{scores?.total ?? '—'}<small>/ 100</small></strong></div></div><div className="al-score-heading"><p className="al-source-label">{scores?.label || 'あなたの回答から見えてきたこと'}</p><h3>{scores?.mode === 'explore' ? scores.wishLabel : scores?.typeLabel || '自分に合う形を、探していこう'}</h3><p>{scores?.mode === 'explore' ? 'まず試してみる候補。ここから選び直しても大丈夫。' : answerText(QUESTIONS[0], answers)}</p></div></div>
      {scores?.unavailableReason && <p className="al-score-unavailable">{scores.unavailableReason}</p>}
      <p className="al-score-takeaway">{byId('overlap').body[0]}</p>
      {scores?.candidates?.length > 0 && <div className="al-score-candidates" aria-label="試してみる方向の候補">{scores.candidates.map(candidate => <div key={candidate.id}><span>{candidate.label}</span><strong>{candidate.score} <small>/ 100</small></strong></div>)}</div>}
      <div className="al-score-metrics">{scores?.metrics.map(metric => <div className="al-score-metric" key={metric.id}><div><span>{metric.label}</span><strong>{metric.value === null ? '未確認' : `${metric.value} / 100`}</strong></div><div className="al-score-track" role={metric.value === null ? undefined : 'meter'} aria-label={metric.label} aria-valuenow={metric.value ?? undefined} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${metric.value ?? 0}%` }} /></div></div>)}</div>
      <details className="al-score-method"><summary>スコアの見方</summary>{scores ? <><p>{scores.formula}</p><p>関心・経験は、選んだ稼ぎ方との重なりです。経験が未確認でも、低い能力を意味しません。</p><p>{scores.note}</p><p>出生図は、2・6・10ハウスの支配星の所在、2ハウスの在室天体、水星・金星の所在を使います。星座やアスペクトなど、出生図全体の評価ではありません。</p><p>出生図の内訳（稼ぎ方との対応点／重み）</p><ul>{scores.components.map((c, i) => <li key={i}>{c.label}：{c.house}ハウス／{Math.round(c.value)}点／重み{Number(c.weight.toFixed(2))}</li>)}</ul><small>採点ルール：{scores.version}</small></> : <p>スコアの表示にはサーバーの更新が必要です。文章の見立ては確認できます。</p>}</details>
    </section>
    <section className="al-one-step"><span className="al-source-label">まず、ひとつ試すなら</span><p>{byId('action').body[0]}</p></section>
    <ResultCard section={byId('overlap')} compact onRevise={onRevise} busy={busy} />
    <div className="al-result-answer-edit"><button type="button" className="al-text-button" disabled={busy} onClick={onEditAnswers}><Pencil size={15} />回答を変えて、もう一度見る</button></div>
    <details className="al-result-detail"><summary>詳しい見立てと根拠を見る</summary><div className="al-insight-grid">{['overlap', 'tension', 'action'].map((id, i) => <ResultCard key={id} section={byId(id)} number={`0${i + 1}`} onRevise={onRevise} busy={busy} />)}</div></details>
    <details className="al-result-detail"><summary>回答・出生図の詳細を見る</summary>
      <div className="al-detail-columns"><section><h3>あなたの回答</h3><dl className="al-answer-list">{QUESTIONS.slice(1).map(q => <div key={q.id}><dt>{q.label}</dt><dd>{answerText(q, answers)}</dd>{supplements[q.id] && <dd>補足：{supplements[q.id]}</dd>}</div>)}</dl>{supplements.wish && <p className="al-small">稼ぎ方への補足：{supplements.wish}</p>}</section><section><h3>追加で伝えてくれたこと</h3><dl className="al-answer-list">{openQuestions.map(q => <div key={q.id}><dt>{q.text}</dt><dd>{openAnswers[q.id] || '未回答'}</dd></div>)}</dl></section></div>
      {chart && <ChartFacts chart={chart} />}
      <section className="al-result-limits"><h3>まだ判断できないこと</h3><ul>{byId('unknown').body.map((text, i) => <li key={i}>{text}</li>)}</ul></section>
      <div className="al-editor-actions"><button type="button" className="al-secondary" disabled={busy} onClick={onEditOpen}>追加回答を変更する<ArrowRight size={15} /></button><button type="button" className="al-secondary" disabled={busy} onClick={onEditBirth}>出生情報を変更する<ArrowRight size={15} /></button></div>
    </details>
    {revisions.length > 0 && <details className="al-result-detail"><summary>補足・訂正の履歴を見る（{revisions.length}件）</summary><ol className="al-revision-list">{revisions.map(r => <li key={r.number}><span>{TITLES[r.section] || SECTION_LABELS[r.section]}・{REACTIONS[r.kind] || 'しっくりくる'}</span><p>{r.note || 'しっくりくる'}</p></li>)}</ol>{history.map((h, i) => <details className="al-evidence" key={i}><summary>{i + 1}回目の補足前のまとめ</summary>{h.sections.map(s => <section key={s.id}><h4>{TITLES[s.id] || s.title}</h4><ul>{s.body.map((text, j) => <li key={j}>{text}</li>)}</ul></section>)}</details>)}</details>}
  </div>;
}
