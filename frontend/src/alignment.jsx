import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, Check, Download, Leaf, Plus, Sparkles } from 'lucide-react';
import { QUESTIONS, selectAnswer, canContinue, answerText } from './alignment-flow.mjs';
import { FORMAT, STORAGE_KEY, EMPTY_BIRTH, SECTION_LABELS, followups, birthPayload, reflect, restoreSession } from './alignment-session.mjs';
import { alignmentRequest } from './alignment-api.mjs';
import { BirthFields, ChartFacts } from './alignment-panels.jsx';
import './alignment.css';

const STAGES = ['あなたの望み', '生まれたときのこと', 'ことばを添える', '照らし合わせる'];
const FEEDBACK = { agree: 'しっくりくる', different: '少し違う', conditional: '条件による', add: '補足したい' };

function App() {
  const [phase, setPhase] = useState('questions'), [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({}), [supplements, setSupplements] = useState({});
  const [birth, setBirth] = useState({ ...EMPTY_BIRTH }), [chart, setChart] = useState(null);
  const [busy, setBusy] = useState(''), [locations, setLocations] = useState([]), [country, setCountry] = useState('JP');
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [openIndex, setOpenIndex] = useState(0), [openAnswers, setOpenAnswers] = useState({});
  const [feedback, setFeedback] = useState(''), [feedbackSection, setFeedbackSection] = useState('tension'), [feedbackKind, setFeedbackKind] = useState('add');
  const [revisions, setRevisions] = useState([]), [history, setHistory] = useState([]);
  const [savedAvailable, setSavedAvailable] = useState(false), [resetOpen, setResetOpen] = useState(false);
  const headingRef = useRef(null), importRef = useRef(null), requestId = useRef(0), initialRender = useRef(true);
  const stage = phase === 'questions' ? 0 : phase === 'birth' ? 1 : phase === 'open' ? 2 : 3;
  const question = QUESTIONS[index], openQuestions = followups(answers), sections = reflect(answers, chart, revisions);
  const today = new Date().toLocaleDateString('en-CA');

  useEffect(() => { try { setSavedAvailable(Boolean(localStorage.getItem(STORAGE_KEY))); } catch { /* File export works without storage. */ } }, []);
  useEffect(() => { if (initialRender.current) { initialRender.current = false; return; } headingRef.current?.focus(); }, [phase, index, openIndex]);
  function changed() { setNotice('変更内容はまだ保存していません。必要なら「この端末に保存」を押してください。'); }
  function updateBirth(patch) { requestId.current++; setBusy(''); setChart(null); setLocations([]); setError(''); setBirth(p => ({ ...p, ...patch })); changed(); }
  function nextQuestion(e) { e.preventDefault(); if (!canContinue(question, answers[question.id])) return; if (index < QUESTIONS.length - 1) setIndex(index + 1); else { setError(''); setPhase('birth'); } }
  async function searchPlace() {
    if (!birth.place.trim()) { setError('出生地名を入力してください。'); return; }
    const id = ++requestId.current; setBusy('search'); setError(''); setLocations([]);
    try {
      const params = new URLSearchParams({ q: birth.place, country_code: country, limit: '5' });
      const data = await alignmentRequest(`/api/location-search?${params}`);
      if (id !== requestId.current) return;
      setLocations(data.results || []); if (!data.results?.length) setError('候補がありません。市区町村名を変えるか、座標を直接入力してください。');
    } catch (e) { if (id === requestId.current) setError(e.message); } finally { if (id === requestId.current) setBusy(''); }
  }
  async function advanceBirth(e) {
    e.preventDefault(); let payload;
    try { payload = birthPayload(birth, today); } catch (e) { setError(e.message); return; }
    const id = ++requestId.current; setBusy('chart'); setError(''); setChart(null);
    try {
      const data = await alignmentRequest('/api/alignment/chart', payload);
      if (!Array.isArray(data.planets) || !Array.isArray(data.houses) || !Array.isArray(data.aspects)) throw new Error('出生図の応答形式を確認できませんでした。');
      if (id !== requestId.current) return;
      setChart(data); setOpenIndex(0); setPhase('open'); changed();
    } catch (e) { if (id === requestId.current) setError(e.message); } finally { if (id === requestId.current) setBusy(''); }
  }
  function skipBirth() { requestId.current++; setBusy(''); setChart(null); setError(''); setOpenIndex(0); setPhase('open'); changed(); }
  function advanceOpen() { if (openIndex < openQuestions.length - 1) setOpenIndex(openIndex + 1); else { setPhase('summary'); changed(); } }
  function applyFeedback() {
    if (revisions.length >= 50) { setError('補足は50件までです。記録を保存してから、必要なら新しく始めてください。'); return; }
    if (feedbackKind !== 'agree' && !feedback.trim()) return;
    setHistory(h => [...h, { at: new Date().toISOString(), sections: sections.map(s => ({ id: s.id, title: s.title, body: [...s.body, ...(s.update ? [`本人の補足：${s.update.note || FEEDBACK[s.update.kind]}`] : [])] })) }].slice(-20));
    setRevisions(r => [...r, { number: r.length + 1, section: feedbackSection, kind: feedbackKind, note: feedback.trim(), at: new Date().toISOString() }]);
    setFeedback(''); setError(''); setNotice('本人の補足を反映しました。「少し違う」「条件による」の仮説は保留にし、元のまとめは履歴に残しました。変更後の記録は未保存です。');
  }
  function sessionData() { return { format: FORMAT, savedAt: new Date().toISOString(), phase, index, openIndex, answers, supplements, birth, openAnswers, revisions, history, chart, feedback, feedbackSection, feedbackKind, aiConnected: false }; }
  function saveLocal() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData())); setSavedAvailable(true); setNotice('このブラウザに保存しました。出生情報・回答・補足を含みます。変更後はもう一度保存してください。'); } catch { setNotice('ブラウザに保存できませんでした。「ファイル保存」をお使いください。'); } }
  function saveFile() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(sessionData(), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `atelier-alignment-${today}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('出生情報・回答・補足を含むファイルを保存しました。');
  }
  function load(raw) {
    const data = restoreSession(raw); requestId.current++; setBusy(''); setLocations([]); setChart(null);
    setAnswers(data.answers); setSupplements(data.supplements); setBirth(data.birth); setOpenAnswers(data.openAnswers); setRevisions(data.revisions); setHistory(data.history);
    setIndex(data.index); setOpenIndex(data.openIndex); setPhase(data.phase); setFeedback(data.feedback); setFeedbackSection(data.feedbackSection); setFeedbackKind(data.feedbackKind); setResetOpen(false); setError('');
    setNotice('記録を読み込みました。出生図は保存値を流用せず未計算に戻しています。必要なら「出生情報を見直す」から再計算してください。');
  }
  function loadLocal() { try { load(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch (e) { setError(e.message || '保存内容を読み込めませんでした。'); } }
  async function importFile(e) { const file = e.target.files?.[0]; if (!file) return; try { if (file.size > 500000) throw new Error('500KB以下の保存ファイルを選んでください。'); load(JSON.parse(await file.text())); } catch (err) { setError(err instanceof SyntaxError ? 'JSON形式の保存ファイルを選んでください。' : err.message); } finally { e.target.value = ''; } }
  function reset() {
    requestId.current++; setBusy(''); setLocations([]); setAnswers({}); setSupplements({}); setBirth({ ...EMPTY_BIRTH }); setChart(null); setOpenAnswers({}); setRevisions([]); setHistory([]); setFeedback('');
    setIndex(0); setOpenIndex(0); setPhase('questions'); setResetOpen(false); setError(''); setNotice('新しく始めました。端末に保存した記録は「保存記録を削除」で消せます。');
  }

  return <>
    <header className="al-header"><a className="al-brand" href="./index.html">The Celestial Atelier<span>星と、自分を見つめるアトリエ</span></a><a className="al-back-link" href="./index.html"><ArrowLeft size={14} />テスト入口に戻る</a></header>
    <main className="al-main">
      <div className="al-intro"><p className="al-eyebrow"><span />A LITTLE SELF-EXPLORATION</p><h1>望みと、あなたらしさの<br />重なるところへ。</h1><p className="al-lead">どんなふうに稼ぎ、何を大切にしたいのか。<br />小さな問いをたどって、自分の輪郭を見つける時間。</p><div className="al-prototype"><Sparkles size={15} /><span><strong>テスト版</strong>　出生図は計算APIで確認。追加質問と仮まとめはルールによる整理です。AIは未接続です。</span></div></div>
      <div className="al-tools" aria-label="記録の管理"><button type="button" className="al-text-button" onClick={saveLocal}>この端末に保存</button><button type="button" className="al-text-button" onClick={saveFile}><Download size={13} />ファイル保存</button>{savedAvailable && <button type="button" className="al-text-button" disabled={!!busy} onClick={loadLocal}>保存記録を再開</button>}<button type="button" className="al-text-button" disabled={!!busy} onClick={() => importRef.current.click()}>ファイルを読み込む</button><input ref={importRef} type="file" accept=".json,application/json" onChange={importFile} className="al-sr-only" aria-label="保存ファイル" tabIndex={-1} /><button type="button" className="al-text-button" onClick={() => setResetOpen(!resetOpen)} aria-expanded={resetOpen}>新しく始める・削除</button></div>
      {resetOpen && <div className="al-pending"><p className="al-small">画面の回答を消して新しく始めますか？ 必要な記録は先に保存してください。</p><div className="al-tools"><button type="button" className="al-secondary" onClick={reset}>画面の回答を消して始める</button>{savedAvailable && <button type="button" className="al-secondary" onClick={() => { try { localStorage.removeItem(STORAGE_KEY); setSavedAvailable(false); setNotice('このブラウザの保存記録を削除しました。画面の回答とダウンロード済みファイルは残ります。'); } catch { setError('保存記録を削除できませんでした。'); } }}>保存記録を削除</button>}<button type="button" className="al-text-button" onClick={() => setResetOpen(false)}>閉じる</button></div></div>}
      <p className="al-notice" role="status">{notice}</p>{error && <p className="al-error" role="alert">{error}</p>}
      <nav className="al-stages" aria-label="体験の進み具合">{STAGES.map((label, i) => <div key={label} className={i === stage ? 'is-current' : i < stage ? 'is-done' : ''} aria-current={i === stage ? 'step' : undefined}><span>{i < stage ? <Check size={12} /> : `0${i + 1}`}</span><p>{label}</p></div>)}</nav>
      <div className="al-layout"><section className="al-card" aria-labelledby="al-step-title" aria-busy={!!busy}>
        {phase === 'questions' && <form onSubmit={nextQuestion}>
          <div className="al-card-meta"><span>QUESTION {String(index + 1).padStart(2, '0')}</span><span>{index + 1} / {QUESTIONS.length}</span></div><h2 id="al-step-title" ref={headingRef} tabIndex={-1}>{question.title}</h2><p className="al-hint" id="al-question-hint">{question.hint}</p>
          {question.text ? <label className="al-field">大切にしたいテーマ<textarea maxLength={600} rows={4} value={answers[question.id] || ''} placeholder="まだ決まっていない、でも大丈夫。" onChange={e => { changed(); setAnswers({ ...answers, [question.id]: e.target.value }); }} /></label> : <fieldset className="al-options" aria-describedby="al-question-hint"><legend className="al-sr-only">{question.title}</legend>{question.options.map(([value, label], i) => <label className={`al-option ${(answers[question.id] || []).includes(value) ? 'is-selected' : ''}`} key={value}><input type={question.multiple ? 'checkbox' : 'radio'} name={question.id} value={value} checked={(answers[question.id] || []).includes(value)} onChange={() => { changed(); setAnswers({ ...answers, [question.id]: selectAnswer(answers[question.id], value, question.multiple) }); }} /><span className="al-option-letter" aria-hidden="true">{String.fromCharCode(65 + i)}</span><span>{label}</span><span className="al-choice-mark" aria-hidden="true"><Check size={14} /></span></label>)}</fieldset>}
          <details className="al-details"><summary><Plus size={13} />理由や条件を、ひと言添える</summary><label className="al-field">この回答への補足<textarea rows={2} maxLength={600} value={supplements[question.id] || ''} onChange={e => { changed(); setSupplements({ ...supplements, [question.id]: e.target.value }); }} /></label></details><div className="al-actions"><button type="button" className="al-text-button" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft size={14} />前の質問</button><button className="al-primary" disabled={!canContinue(question, answers[question.id])}>{index === QUESTIONS.length - 1 ? '生まれたときのことへ' : '次の問いへ'}<ArrowRight size={16} /></button></div>
        </form>}
        {phase === 'birth' && <form onSubmit={advanceBirth}><p className="al-eyebrow">YOUR BIRTH DETAILS</p><h2 id="al-step-title" ref={headingRef} tabIndex={-1}>生まれたときのこと。</h2><p className="al-hint">出生地の現地時刻を入力してください。出生図を使わず、回答だけで続けることもできます。</p><BirthFields {...{ birth, today, updateBirth, country, setCountry, busy, locations, searchPlace }} /><div className="al-actions"><button type="button" className="al-text-button" disabled={!!busy} onClick={() => { setError(''); setIndex(QUESTIONS.length - 1); setPhase('questions'); }}><ArrowLeft size={14} />質問に戻る</button><button className="al-primary" disabled={!!busy}>{busy === 'chart' ? '出生図を計算中…' : '出生図を計算して次へ'}<ArrowRight size={16} /></button></div><button type="button" className="al-skip" onClick={skipBirth}>出生図を使わず、回答だけで続ける</button></form>}
        {phase === 'open' && <form onSubmit={e => { e.preventDefault(); advanceOpen(); }}><div className="al-card-meta"><span>A LITTLE MORE ABOUT YOU</span><span>{openIndex + 1} / {openQuestions.length}</span></div><h2 id="al-step-title" ref={headingRef} tabIndex={-1}>あなたのことばで、もう少し。</h2><p className="al-hint">選んだ回答に応じて、もう少し聞きたい問いを用意しました。AI接続前のため、自由記述は原文のまままとめに添えます。</p><label className="al-field al-open-question">{openQuestions[openIndex].text}<textarea rows={6} maxLength={2000} value={openAnswers[openQuestions[openIndex].id] || ''} placeholder="うまくまとまっていなくても大丈夫です。" onChange={e => { changed(); setOpenAnswers({ ...openAnswers, [openQuestions[openIndex].id]: e.target.value }); }} /></label><div className="al-actions"><button type="button" className="al-text-button" onClick={() => openIndex ? setOpenIndex(openIndex - 1) : setPhase('birth')}><ArrowLeft size={14} />戻る</button><button className="al-primary">{openIndex === openQuestions.length - 1 ? '仮のまとめを見る' : '次の問いへ'}<ArrowRight size={16} /></button></div><button type="button" className="al-skip" onClick={advanceOpen}>この問いは答えずに進む</button></form>}
        {phase === 'summary' && <>
          <p className="al-eyebrow">YOUR REFLECTION · 補足 {revisions.length}件</p><h2 id="al-step-title" ref={headingRef} tabIndex={-1}>いま見えている、あなたの輪郭。</h2><p className="al-hint">回答と計算済みの配置を、決めたルールで整理した仮まとめです。能力や金運の採点ではありません。自由記述の意味の解釈は、AI接続後に対応します。</p>
          {sections.map(section => <section className="al-result" key={section.id}><h3>{section.title}</h3>{section.body.map((text, i) => <p className="al-preserve" key={i}>{text}</p>)}{section.update && <div className="al-update"><strong>{FEEDBACK[section.update.kind]}</strong>{section.update.note && <p className="al-preserve">本人の補足：{section.update.note}</p>}<p className="al-small">{['different', 'conditional'].includes(section.update.kind) ? '修正した点：元の仮説を保留。未判断：補足の意味を踏まえた再解釈。' : '維持した点：元の整理。追加した点：本人の反応・補足。'}</p></div>}<details className="al-details"><summary>根拠・最初の仮説を確認</summary>{section.evidence.map((text, i) => <p className="al-small" key={i}>{text}</p>)}{section.update && section.original.map((text, i) => <p className="al-small" key={`o${i}`}>修正前のルール整理：{text}</p>)}{!section.evidence.length && <p className="al-small">現在の情報では判断を限定しています。</p>}</details><div className="al-reactions">{Object.entries(FEEDBACK).map(([kind, label]) => <button className="al-text-button" type="button" key={kind} aria-pressed={feedbackSection === section.id && feedbackKind === kind} onClick={() => { setFeedbackSection(section.id); setFeedbackKind(kind); setError(''); }}>{label}</button>)}</div></section>)}
          {chart && <ChartFacts chart={chart} />}
          <details className="al-details"><summary>回答と自由記述を確認する</summary><dl className="al-answer-list">{QUESTIONS.map(q => <div key={q.id}><dt>{q.title}</dt><dd>{answerText(q, answers)}</dd>{supplements[q.id] && <dd>本人の補足：{supplements[q.id]}</dd>}</div>)}{openQuestions.map(q => <div key={q.id}><dt>{q.text}</dt><dd>{openAnswers[q.id] || '未回答'}</dd></div>)}</dl><p className="al-small">自由記述と各回答への補足は、ルールで意味を決めつけず原文で保存します。</p></details>
          <section className="al-feedback"><h3>「少し違う」も、大切な手がかり。</h3><label className="al-field">補足する項目<select value={feedbackSection} onChange={e => setFeedbackSection(e.target.value)}>{Object.entries(SECTION_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="al-field">いまの反応<select value={feedbackKind} onChange={e => setFeedbackKind(e.target.value)}>{Object.entries(FEEDBACK).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="al-field">補足・訂正したいこと<textarea maxLength={2000} rows={4} value={feedback} placeholder="例えば：深追いはしないけれど、できる範囲で助力したい。" onChange={e => setFeedback(e.target.value)} /></label><button type="button" className="al-primary" disabled={feedbackKind !== 'agree' && !feedback.trim()} onClick={applyFeedback}>補足を反映する<ArrowRight size={16} /></button><p className="al-small">「少し違う」「条件による」は元の仮説を保留にします。入力した文章の意味を読み取るAI再解釈は、まだ行いません。</p></section>
          {revisions.length > 0 && <details className="al-details"><summary>補足の履歴（{revisions.length}件）</summary><ol className="al-history">{revisions.map(r => <li key={r.number}><strong>{SECTION_LABELS[r.section]}／{FEEDBACK[r.kind]}</strong><p>{r.note || 'しっくりくる'}</p></li>)}</ol></details>}
          {history.length > 0 && <details className="al-details"><summary>更新前のまとめ（直近{history.length}件）</summary>{history.map((h, i) => <details className="al-details" key={i}><summary>{i + 1}：{new Date(h.at).toLocaleString('ja-JP')}</summary>{h.sections.map(s => <div key={s.id}><h4>{s.title}</h4>{s.body.map((p, j) => <p className="al-small al-preserve" key={j}>{p}</p>)}</div>)}</details>)}</details>}
          <div className="al-actions"><button type="button" className="al-text-button" onClick={() => { setOpenIndex(0); setPhase('open'); }}><ArrowLeft size={14} />追加回答を見直す</button><button type="button" className="al-text-button" onClick={() => { setError(''); setPhase('birth'); }}>出生情報を見直す・再計算</button><button type="button" className="al-secondary" onClick={saveLocal}>この端末に保存</button></div>
        </>}
      </section><aside className="al-sidebar" aria-label="たどってきた道筋"><p className="al-eyebrow">YOUR LITTLE PATH</p><h2>答えを決めるより、<br />自分を知るために。</h2><ol className="al-path">{QUESTIONS.map((q, i) => <li key={q.id} className={answers[q.id]?.length ? 'is-answered' : ''}><span className="al-path-dot" /><button type="button" disabled={!!busy || (phase === 'questions' && i > index)} aria-current={phase === 'questions' && i === index ? 'step' : undefined} onClick={() => { setError(''); setIndex(i); setPhase('questions'); }}>{q.label}</button>{answers[q.id]?.length > 0 && <small>{answerText(q, answers)}</small>}</li>)}</ol><div className="al-sidebar-note"><Leaf size={19} /><p>どの答えも、あなたを決めつけるものではありません。わからないところは、そのままで。</p></div></aside></div>
      <p className="al-privacy">登録なしで試せます。回答と自由記述はサーバーへ送信しません。出生図の計算時のみ、出生情報を計算APIへ送ります。<br />自動保存はしません。「この端末に保存」はこのブラウザだけに保存します。共有端末では保存を避け、削除できます。ファイル保存には出生情報を含みます。</p>
    </main><footer className="al-footer"><span>The Celestial Atelier</span><a href="https://thecelestialatelier.com/legal/privacy.html">プライバシーポリシー</a></footer>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
