import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, Check, Download, Leaf, Plus, Sparkles } from 'lucide-react';
import { QUESTIONS, OPEN_QUESTIONS, selectAnswer, canContinue, answerText, validateBirth, recordRevision } from './alignment-flow.mjs';
import './alignment.css';

const STAGES = ['あなたの望み', '生まれたときのこと', 'ことばを添える', '照らし合わせる'];

function App() {
  const [phase, setPhase] = useState('questions');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [supplements, setSupplements] = useState({});
  const [birth, setBirth] = useState({ date: '', time: '', place: '', unknownTime: false });
  const [birthSkipped, setBirthSkipped] = useState(false);
  const [error, setError] = useState('');
  const [openIndex, setOpenIndex] = useState(0);
  const [openAnswers, setOpenAnswers] = useState(['', '']);
  const [feedback, setFeedback] = useState('');
  const [revisions, setRevisions] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const headingRef = useRef(null);
  const initialRender = useRef(true);
  const stage = phase === 'questions' ? 0 : phase === 'birth' ? 1 : phase === 'open' ? 2 : 3;
  const question = QUESTIONS[index];
  const today = new Date().toLocaleDateString('en-CA');

  useEffect(() => {
    if (initialRender.current) { initialRender.current = false; return; }
    headingRef.current?.focus();
  }, [phase, index, openIndex]);

  function invalidateSummary() {
    // Reviewing or changing an answer must not silently discard personal notes.
    setNotice(''); setHistoryOpen(false);
  }
  function nextQuestion(event) {
    event.preventDefault();
    if (!canContinue(question, answers[question.id])) return;
    if (index < QUESTIONS.length - 1) setIndex(index + 1);
    else { setError(''); setPhase('birth'); }
  }
  function advanceBirth(event) {
    event.preventDefault();
    const message = validateBirth(birth, today);
    setError(message);
    if (!message) { setBirthSkipped(false); setOpenIndex(0); setPhase('open'); }
  }
  function advanceOpen() {
    if (openIndex < OPEN_QUESTIONS.length - 1) setOpenIndex(openIndex + 1);
    else setPhase('summary');
  }
  function saveToDevice() {
    const content = {
      format: 'atelier-alignment-prototype-v1', prototype: true, calculatedChart: null, aiConnected: false,
      answers: QUESTIONS.map(q => ({ question: q.title, answer: answerText(q, answers), supplement: supplements[q.id] || '' })),
      birth: birthSkipped ? null : { ...birth, time: birth.unknownTime ? null : birth.time },
      openAnswers: OPEN_QUESTIONS.map((q, i) => ({ question: q, answer: openAnswers[i] || '未回答' })), revisions,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'atelier-alignment-prototype.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('回答と補足の記録を、端末への保存用ファイルにしました。');
  }

  return <>
    <header className="al-header">
      <a className="al-brand" href="./index.html">The Celestial Atelier<span>星と、自分を見つめるアトリエ</span></a>
      <a className="al-back-link" href="./index.html"><ArrowLeft size={14} /> テスト入口に戻る</a>
    </header>
    <main className="al-main">
      <div className="al-intro">
        <p className="al-eyebrow"><span /> A LITTLE SELF-EXPLORATION</p>
        <h1>望みと、あなたらしさの<br />重なるところへ。</h1>
        <p className="al-lead">どんなふうに稼ぎ、何を大切にしたいのか。<br className="al-desktop-break" />小さな問いをたどって、自分の輪郭を見つける時間。</p>
        <div className="al-prototype"><Sparkles size={15} /><span><strong>画面プロトタイプ</strong>　質問は仮案です。出生図の計算・AIにはまだ接続していません。</span></div>
      </div>

      <nav className="al-stages" aria-label="体験の進み具合">
        {STAGES.map((label, i) => <div key={label} className={i === stage ? 'is-current' : i < stage ? 'is-done' : ''} aria-current={i === stage ? 'step' : undefined}><span>{i < stage ? <Check size={12} /> : `0${i + 1}`}</span><p>{label}</p></div>)}
      </nav>

      <div className="al-layout">
        <section className="al-card" aria-labelledby="al-step-title">
          {phase === 'questions' && <form onSubmit={nextQuestion}>
            <div className="al-card-meta"><span>QUESTION {String(index + 1).padStart(2, '0')}</span><span>{index + 1} / {QUESTIONS.length}</span></div>
            <h2 id="al-step-title" ref={headingRef} tabIndex={-1}>{question.title}</h2>
            <p className="al-hint" id="al-question-hint">{question.hint}</p>
            {question.text ? <label className="al-field">大切にしたいテーマ<textarea maxLength={600} rows={4} value={answers[question.id] || ''} placeholder="まだ決まっていない、でも大丈夫。" onChange={e => { invalidateSummary(); setAnswers({ ...answers, [question.id]: e.target.value }); }} /></label> : <fieldset className="al-options" aria-describedby="al-question-hint"><legend className="al-sr-only">{question.title}</legend>
              {question.options.map(([value, label], i) => <label className={`al-option ${(answers[question.id] || []).includes(value) ? 'is-selected' : ''}`} key={value}><input type={question.multiple ? 'checkbox' : 'radio'} name={question.id} value={value} checked={(answers[question.id] || []).includes(value)} onChange={() => { invalidateSummary(); setAnswers({ ...answers, [question.id]: selectAnswer(answers[question.id], value, question.multiple) }); }} /><span className="al-option-letter" aria-hidden="true">{String.fromCharCode(65 + i)}</span><span>{label}</span><span className="al-choice-mark" aria-hidden="true"><Check size={14} /></span></label>)}
            </fieldset>}
            <details className="al-details"><summary><Plus size={13} /> 理由や条件を、ひと言添える</summary><label className="al-field">この回答への補足<textarea rows={2} maxLength={600} value={supplements[question.id] || ''} onChange={e => { invalidateSummary(); setSupplements({ ...supplements, [question.id]: e.target.value }); }} /></label></details>
            <div className="al-actions"><button type="button" className="al-text-button" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft size={14} /> 前の質問</button><button className="al-primary" disabled={!canContinue(question, answers[question.id])}>{index === QUESTIONS.length - 1 ? '生まれたときのことへ' : '次の問いへ'}<ArrowRight size={16} /></button></div>
          </form>}

          {phase === 'birth' && <form onSubmit={advanceBirth}>
            <p className="al-eyebrow">YOUR BIRTH DETAILS</p><h2 id="al-step-title" ref={headingRef} tabIndex={-1}>生まれたときのこと。</h2>
            <p className="al-hint">出生図を重ねるための入力画面です。今は計算しないため、入力せずに画面の続きを試すこともできます。</p>
            <div className="al-birth-grid">
              <label className="al-field">生年月日<input type="date" min="1900-01-01" max={today} value={birth.date} onChange={e => { invalidateSummary(); setBirth({ ...birth, date: e.target.value }); setError(''); }} /></label>
              <label className="al-field">出生時刻<input type="time" disabled={birth.unknownTime} value={birth.time} onChange={e => { invalidateSummary(); setBirth({ ...birth, time: e.target.value }); setError(''); }} /></label>
            </div>
            <label className="al-check"><input type="checkbox" checked={birth.unknownTime} onChange={e => { invalidateSummary(); setBirth({ ...birth, unknownTime: e.target.checked }); setError(''); }} />出生時刻はわからない</label>
            <label className="al-field">出生地<input type="text" maxLength={150} autoComplete="off" placeholder="例：埼玉県川口市" value={birth.place} onChange={e => { invalidateSummary(); setBirth({ ...birth, place: e.target.value }); setError(''); }} /></label>
            <p className="al-small">出生地検索・保存済み情報の再利用・ハウス計算は、今後接続します。時刻不明の場合は、ハウスによる判断を限定する予定です。</p>
            {error && <p className="al-error" role="alert">{error}</p>}
            <div className="al-actions"><button type="button" className="al-text-button" onClick={() => { setIndex(QUESTIONS.length - 1); setPhase('questions'); }}><ArrowLeft size={14} /> 質問に戻る</button><button className="al-primary">入力内容を確認して次へ<ArrowRight size={16} /></button></div>
            <button type="button" className="al-skip" onClick={() => { setBirthSkipped(true); setError(''); setOpenIndex(0); setPhase('open'); }}>入力せず、画面の続きを試す</button>
          </form>}

          {phase === 'open' && <form onSubmit={e => { e.preventDefault(); advanceOpen(); }}>
            <div className="al-card-meta"><span>A LITTLE MORE ABOUT YOU</span><span>{openIndex + 1} / {OPEN_QUESTIONS.length}</span></div>
            <h2 id="al-step-title" ref={headingRef} tabIndex={-1}>あなたのことばで、もう少し。</h2>
            <p className="al-hint">本実装では、固定質問の回答を受けてAIが1〜3問お聞きします。現在は、動線を確かめるための固定の質問例です。</p>
            <label className="al-field al-open-question">{OPEN_QUESTIONS[openIndex]}<textarea rows={6} maxLength={2000} value={openAnswers[openIndex]} placeholder="うまくまとまっていなくても大丈夫です。" onChange={e => { invalidateSummary(); setOpenAnswers(openAnswers.map((value, i) => i === openIndex ? e.target.value : value)); }} /></label>
            <div className="al-actions"><button type="button" className="al-text-button" onClick={() => openIndex ? setOpenIndex(openIndex - 1) : setPhase('birth')}><ArrowLeft size={14} /> 戻る</button><button className="al-primary">{openIndex === OPEN_QUESTIONS.length - 1 ? 'まとめの画面へ' : '次の問いへ'}<ArrowRight size={16} /></button></div>
            <button type="button" className="al-skip" onClick={advanceOpen}>この問いは答えずに進む</button>
          </form>}

          {phase === 'summary' && <>
            <p className="al-eyebrow">YOUR REFLECTION · {revisions.length ? `VERSION ${revisions.length + 1}` : 'FIRST VIEW'}</p>
            <h2 id="al-step-title" ref={headingRef} tabIndex={-1}>いま見えている、あなたの輪郭。</h2>
            <p className="al-hint">まとめ画面のプレビューです。以下は回答の再掲であり、AIの見立てや出生図の判定ではありません。</p>
            <section className="al-result"><h3>あなたが望んでいること</h3><p>{answerText(QUESTIONS[0], answers)}</p>{answers.theme?.trim() && <p className="al-quote">大切にしたいこと：{answers.theme}</p>}</section>
            <section className="al-result"><h3>回答から見えた経験・傾向</h3><dl className="al-answer-list">{QUESTIONS.slice(1, -1).map(q => <div key={q.id}><dt>{q.label}</dt><dd>{answerText(q, answers)}</dd></div>)}</dl></section>
            <section className="al-result al-pending"><h3>出生図との重なり・違いの候補</h3><p>未判定です。{birthSkipped ? '出生情報は入力せずに進めています。' : `${birth.date}${birth.unknownTime ? '・出生時刻不明' : ` ${birth.time}`}／${birth.place}を画面内で保持していますが、出生図はまだ計算していません。`}本実装では、計算した配置と回答を根拠として表示します。</p></section>
            <section className="al-result"><h3>まだ判断できないこと</h3><p>質問・分岐・解釈の基準は設計中です。この画面から、金運や適性の優劣、成功確率を判断することはできません。</p></section>
            <details className="al-details"><summary>回答と補足の記録を見る</summary><dl className="al-answer-list">{QUESTIONS.map(q => <div key={q.id}><dt>{q.title}</dt><dd>{answerText(q, answers)}</dd>{supplements[q.id] && <dd>補足：{supplements[q.id]}</dd>}</div>)}{OPEN_QUESTIONS.map((q, i) => <div key={q}><dt>{q}</dt><dd>{openAnswers[i] || '未回答'}</dd></div>)}</dl></details>
            <section className="al-feedback"><h3>「少し違う」も、大切な手がかり。</h3><p className="al-small">条件や背景を補足する画面です。今は文章を記録し、履歴に追加するだけで、AIによる再解釈は行いません。</p><label className="al-field">補足・訂正したいこと<textarea maxLength={2000} rows={4} value={feedback} placeholder="例えば：深追いはしないけれど、できる範囲で助力したい。" onChange={e => setFeedback(e.target.value)} /></label><button type="button" className="al-primary" disabled={!feedback.trim()} onClick={() => { setRevisions(recordRevision(revisions, feedback)); setFeedback(''); setNotice('補足を記録しました。AIによる見立ての更新は未接続です。'); }}>補足を反映した画面を見る<ArrowRight size={16} /></button></section>
            {revisions.length > 0 && <section className="al-result"><h3>更新プレビュー</h3><p>最新の補足：<span className="al-preserve">{revisions.at(-1).note}</span></p><p className="al-small">維持・修正・未判断の整理は、AI接続後に表示します。元の回答は変更していません。</p><button type="button" className="al-text-button" aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}>補足の履歴（{revisions.length}件）</button>{historyOpen && <ol className="al-history">{revisions.map(item => <li key={item.number}><strong>補足 {item.number}</strong><p>{item.note}</p></li>)}</ol>}</section>}
            <p className="al-notice" role="status">{notice}</p>
            <div className="al-actions"><button className="al-text-button" type="button" onClick={() => { setOpenIndex(OPEN_QUESTIONS.length - 1); setPhase('open'); }}><ArrowLeft size={14} /> 回答を見直す</button><button type="button" className="al-secondary" onClick={saveToDevice}><Download size={15} /> 記録を端末に保存</button></div><p className="al-small">保存ファイルには、入力した出生情報・回答・補足を含みます。クラウド保存や登録は不要です。</p>
          </>}
        </section>

        <aside className="al-sidebar" aria-label="たどってきた道筋">
          <p className="al-eyebrow">YOUR LITTLE PATH</p><h2>答えを決めるより、<br />自分を知るために。</h2>
          <ol className="al-path">{QUESTIONS.map((q, i) => <li key={q.id} className={answers[q.id]?.length ? 'is-answered' : ''}><span className="al-path-dot" /><button type="button" disabled={phase === 'questions' && i > index} aria-current={phase === 'questions' && i === index ? 'step' : undefined} onClick={() => { setIndex(i); setPhase('questions'); }}>{q.label}</button>{answers[q.id]?.length > 0 && <small>{answerText(q, answers)}</small>}</li>)}</ol>
          <div className="al-sidebar-note"><Leaf size={19} /><p>どの答えも、あなたを決めつけるものではありません。わからないところは、そのままで。</p></div>
        </aside>
      </div>
      <p className="al-privacy">登録なしで試せます。このプロトタイプは、入力内容をサーバーに送信しません。<br />入力内容はこのページを開いている間だけ保持し、再読み込みすると消えます。</p>
    </main>
    <footer className="al-footer"><span>The Celestial Atelier</span><a href="https://thecelestialatelier.com/legal/privacy.html">プライバシーポリシー</a></footer>
  </>;
}

createRoot(document.getElementById('root')).render(<App />);
