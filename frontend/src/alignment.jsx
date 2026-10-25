import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, Check, Plus } from 'lucide-react';
import { QUESTIONS, selectAnswer, canContinue, answerText } from './alignment-flow.mjs';
import { EMPTY_BIRTH, birthPayload } from './alignment-session.mjs';
import { alignmentRequest } from './alignment-api.mjs';
import { BirthFields } from './alignment-panels.jsx';
import { AlignmentResults } from './alignment-results.jsx';
import './alignment.css';

const STAGES = ['あなたの望み', '生まれたときのこと', 'ことばを添える', '照らし合わせる'];
const FEEDBACK = { agree: 'しっくりくる', different: '少し違う', conditional: '条件による', add: '補足したい' };

function App() {
  const [phase, setPhase] = useState('questions'), [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({}), [supplements, setSupplements] = useState({});
  const [birth, setBirth] = useState({ ...EMPTY_BIRTH }), [chart, setChart] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [openIndex, setOpenIndex] = useState(0), [openAnswers, setOpenAnswers] = useState({});
  const [revisions, setRevisions] = useState([]), [history, setHistory] = useState([]);
  const [openQuestions, setOpenQuestions] = useState([]), [aiResult, setAiResult] = useState(null);
  const headingRef = useRef(null), requestId = useRef(0), initialRender = useRef(true);
  const stage = phase === 'questions' ? 0 : phase === 'birth' ? 1 : phase === 'open' ? 2 : 3;
  const question = QUESTIONS[index], sections = aiResult?.sections || [];
  const today = new Date().toLocaleDateString('en-CA');

  useEffect(() => { if (initialRender.current) { initialRender.current = false; return; } headingRef.current?.focus(); }, [phase, index, openIndex]);
  function updateBirth(patch) { requestId.current++; setBusy(''); setChart(null); setError(''); setBirth(p => ({ ...p, ...patch }));  }
  function nextQuestion(e) { e.preventDefault(); if (!canContinue(question, answers[question.id])) return; if (busy) return; if (index < QUESTIONS.length - 1) setIndex(index + 1); else { setError(''); setPhase('birth'); } }
  async function advanceBirth(e) {
    e.preventDefault(); let payload;
    try { payload = birthPayload(birth, today); } catch (e) { setError(e.message); return; }
    const id = ++requestId.current; setBusy('chart'); setError(''); setChart(null);
    try {
      const data = await alignmentRequest('/api/alignment/chart', payload);
      if (!Array.isArray(data.planets) || !Array.isArray(data.houses) || !Array.isArray(data.aspects)) throw new Error('出生図の応答形式を確認できませんでした。');
      if (id !== requestId.current) return;
      setBusy('questions');
      const generated = await alignmentRequest('/api/alignment/questions', { answers, supplements });
      if (!generated.questions?.length || generated.questions.length > 3) throw new Error('追加の問いを確認できませんでした。もう一度お試しください。');
      if (id !== requestId.current) return;
      setChart(data); setOpenQuestions(generated.questions); setOpenAnswers({}); setOpenIndex(0); setPhase('open');
    } catch (e) { if (id === requestId.current) setError(e.message); } finally { if (id === requestId.current) setBusy(''); }
  }
  function analysisData(notes = revisions) {
    return {
      answers, supplements, birth: birthPayload(birth, today),
      conversation: openQuestions.map(q => ({ question: q.text, answer: openAnswers[q.id] || '' })),
      revisions: notes.slice(-10).map(({ section, kind, note }) => ({ section, kind, note })),
      previous: aiResult?.report || null,
    };
  }
  function attachNotes(result, notes) {
    return { ...result, sections: result.sections.map(s => ({ ...s, update: notes.filter(r => r.section === s.id).at(-1) || null })) };
  }
  async function advanceOpen() {
    if (!chart) { setPhase('birth'); setError('出生時刻を入力し、出生図を計算してください。'); return; }
    if (openIndex < openQuestions.length - 1) { setOpenIndex(openIndex + 1); return; }
    const id = ++requestId.current; setBusy('analysis'); setError('');
    try {
      const result = await alignmentRequest('/api/alignment/analysis', analysisData());
      if (id !== requestId.current) return;
      setAiResult(attachNotes(result, revisions)); setChart(result.chart); setPhase('summary');
    } catch (e) { if (id === requestId.current) setError(e.message); }
    finally { if (id === requestId.current) setBusy(''); }
  }
  async function applyFeedback({ section, kind, note }) {
    if (busy) throw new Error('回答を作成中です。少しお待ちください。');
    if (revisions.length >= 50) throw new Error('補足は50件までです。');
    if (!note.trim()) throw new Error('補足を入力してください。');
    const notes = [...revisions, { number: revisions.length + 1, section, kind, note: note.trim(), at: new Date().toISOString() }];
    const before = { at: new Date().toISOString(), sections: sections.map(s => ({ id: s.id, title: s.title, body: [...s.body, ...(s.update ? [`本人の補足：${s.update.note || FEEDBACK[s.update.kind]}`] : [])] })) };
    setBusy('revision');
    try {
      const result = await alignmentRequest('/api/alignment/analysis', analysisData(notes));
      setHistory(h => [...h, before].slice(-20)); setRevisions(notes);
      setAiResult(attachNotes(result, notes)); setChart(result.chart); setError(''); return true;
    } finally { setBusy(''); }
  }

  return <>
    <header className="al-header"><a className="al-brand" href="./index.html">The Celestial Atelier<span>星と、自分を見つめるアトリエ</span></a><a className="al-back-link" href="./index.html"><ArrowLeft size={14} />トップに戻る</a></header>
    <main className="al-main">
      {phase !== 'summary' && <div className="al-intro"><p className="al-eyebrow"><span />A LITTLE SELF-EXPLORATION</p><h1>望みと、あなたらしさの<br />重なるところへ。</h1><p className="al-lead">望む稼ぎ方と、自分の資質を照らし合わせる。</p></div>}
      {phase !== 'summary' && <nav className="al-stages" aria-label="体験の進み具合">{STAGES.map((label, i) => <div key={label} className={i === stage ? 'is-current' : i < stage ? 'is-done' : ''} aria-current={i === stage ? 'step' : undefined}><span>{i < stage ? <Check size={12} /> : `0${i + 1}`}</span><p>{label}</p></div>)}</nav>}
      <div className={`al-layout ${phase === 'summary' ? 'is-summary' : ''}`}><section className={`al-card ${phase === 'summary' ? 'is-summary' : ''}`} aria-labelledby="al-step-title" aria-busy={!!busy}>
        {phase === 'questions' && <form onSubmit={nextQuestion}>
          <div className="al-card-meta"><span>QUESTION {String(index + 1).padStart(2, '0')}</span><span>{index + 1} / {QUESTIONS.length}</span></div><h2 id="al-step-title" ref={headingRef} tabIndex={-1}>{question.title}</h2><p className="al-hint" id="al-question-hint">{question.hint}</p>
          {question.text ? <label className="al-field">大切にしたいテーマ<textarea maxLength={600} rows={4} value={answers[question.id] || ''} placeholder="まだ決まっていない、でも大丈夫。" onChange={e => {  setAnswers({ ...answers, [question.id]: e.target.value }); }} /></label> : <fieldset className="al-options" aria-describedby="al-question-hint"><legend className="al-sr-only">{question.title}</legend>{question.options.map(([value, label], i) => <label className={`al-option ${(answers[question.id] || []).includes(value) ? 'is-selected' : ''}`} key={value}><input type={question.multiple ? 'checkbox' : 'radio'} name={question.id} value={value} checked={(answers[question.id] || []).includes(value)} onChange={() => {  setAnswers({ ...answers, [question.id]: selectAnswer(answers[question.id], value, question.multiple) }); }} /><span className="al-option-letter" aria-hidden="true">{String.fromCharCode(65 + i)}</span><span>{label}</span><span className="al-choice-mark" aria-hidden="true"><Check size={14} /></span></label>)}</fieldset>}
          <details className="al-details"><summary><Plus size={13} />理由や条件を、ひと言添える</summary><label className="al-field">この回答への補足<textarea rows={2} maxLength={600} value={supplements[question.id] || ''} onChange={e => {  setSupplements({ ...supplements, [question.id]: e.target.value }); }} /></label></details><div className="al-actions"><button type="button" className="al-text-button" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft size={14} />前の質問</button><button className="al-primary" disabled={!canContinue(question, answers[question.id])}>{index === QUESTIONS.length - 1 ? '生まれたときのことへ' : '次の問いへ'}<ArrowRight size={16} /></button></div>
        </form>}
        {phase === 'birth' && <form onSubmit={advanceBirth}><p className="al-eyebrow">YOUR BIRTH DETAILS</p><h2 id="al-step-title" ref={headingRef} tabIndex={-1}>生まれたときのこと。</h2><p className="al-hint">生年月日・出生時刻・都道府県を入力してください。</p><BirthFields {...{ birth, today, updateBirth }} />{error && <p className="al-error" role="alert">{error}</p>}<div className="al-actions"><button type="button" className="al-text-button" disabled={!!busy} onClick={() => { setError(''); setIndex(QUESTIONS.length - 1); setPhase('questions'); }}><ArrowLeft size={14} />質問に戻る</button><button className="al-primary" disabled={!!busy}>{busy === 'chart' ? '計算中…' : busy === 'questions' ? '問いを考えています…' : '次へ'}<ArrowRight size={16} /></button></div></form>}
        {phase === 'open' && <form onSubmit={e => { e.preventDefault(); if (!busy) advanceOpen(); }}><div className="al-card-meta"><span>A LITTLE MORE ABOUT YOU</span><span>{openIndex + 1} / {openQuestions.length}</span></div><h2 id="al-step-title" ref={headingRef} tabIndex={-1}>あなたのことばで、もう少し。</h2><label className="al-field al-open-question">{openQuestions[openIndex].text}<textarea rows={6} disabled={!!busy} maxLength={2000} value={openAnswers[openQuestions[openIndex].id] || ''} placeholder="うまくまとまっていなくても大丈夫です。" onChange={e => {  setOpenAnswers({ ...openAnswers, [openQuestions[openIndex].id]: e.target.value }); }} /></label>{error && <p className="al-error" role="alert">{error}</p>}<div className="al-actions"><button type="button" className="al-text-button" disabled={!!busy} onClick={() => openIndex ? setOpenIndex(openIndex - 1) : setPhase('birth')}><ArrowLeft size={14} />戻る</button><button className="al-primary" disabled={!!busy}>{busy === 'analysis' ? '見立てをまとめています…' : openIndex === openQuestions.length - 1 ? '仮のまとめを見る' : '次の問いへ'}<ArrowRight size={16} /></button></div><button type="button" className="al-skip" disabled={!!busy} onClick={advanceOpen}>この問いは答えずに進む</button></form>}
        {phase === 'summary' && aiResult && <AlignmentResults
          {...{ answers, supplements, openQuestions, openAnswers, chart, sections, revisions, history, headingRef }} scores={aiResult.scores}
          busy={!!busy}
          onRevise={applyFeedback}
          onEditAnswers={() => { setIndex(0); setPhase('questions'); }}
          onEditOpen={() => { setOpenIndex(0); setPhase('open'); }}
          onEditBirth={() => { setError(''); setPhase('birth'); }}
        />}
      </section>{phase !== 'summary' && <aside className="al-sidebar" aria-label="たどってきた道筋"><ol className="al-path">{QUESTIONS.map((q, i) => <li key={q.id} className={answers[q.id]?.length ? 'is-answered' : ''}><span className="al-path-dot" /><button type="button" disabled={!!busy || (phase === 'questions' && i > index)} aria-current={phase === 'questions' && i === index ? 'step' : undefined} onClick={() => { setError(''); setIndex(i); setPhase('questions'); }}>{q.label}</button>{answers[q.id]?.length > 0 && <small>{answerText(q, answers)}</small>}</li>)}</ol></aside>}</div>
    </main><footer className="al-footer"><span>The Celestial Atelier</span><a href="https://thecelestialatelier.com/legal/privacy.html">プライバシーポリシー</a></footer>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
