import React from 'react';
import { Pencil, ArrowRight } from 'lucide-react';
import { ResultCard } from './alignment-results.jsx';
import { ChartFacts } from './alignment-panels.jsx';
import { QUESTIONS, answerText } from './alignment-work-style.mjs';

export function WorkStyleResults({ scores, sections, answers, chart, busy, error, onDeepen, onRevise, onEditAnswers, onEditBirth, aiConnected, headingRef, revisions }) {
  const byId=id=>sections.find(s=>s.id===id);
  return <div className="al-results">
    <div className="al-results-heading"><p className="al-eyebrow">YOUR WORK STYLE</p><h2 ref={headingRef} tabIndex={-1} id="al-step-title">{scores.typeLabel}</h2><p>{scores.tagline}</p></div>
    <section className="al-score-hero" aria-label="働き方の結果">
      <div className="al-score-top"><div className="al-score-dial" style={{'--score':`${scores.total}%`}}><div><span>{scores.scoreLabel}</span><strong>{scores.total}<small>/ 100</small></strong></div></div><div className="al-score-heading"><span className="al-source-label">{scores.mode==='explore'?'まず試す方向を探しているあなたへ':'あなたが望む稼ぎ方'}</span><h3>{scores.wishLabel}</h3><p>大切にしたいのは、{scores.condition}。</p></div></div>
      <div className="al-work-profile" aria-label="7つの持ち味">{scores.profiles.map(p=><div key={p.id} className="al-score-metric"><div><span>{p.label}{p.basis==='chart_only'&&<small>出生図からの候補</small>}</span><strong>{p.value}<small> / 100</small></strong></div><div className="al-score-track" role="meter" aria-label={p.label} aria-valuenow={p.value} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${p.value}%`}} /></div></div>)}</div>
      <details className="al-score-method"><summary>スコアの見方</summary><p>{scores.formula}</p><p>{scores.note}</p><p>24問のうち、21問を7項目の採点に使います。残り3問は望む稼ぎ方・大切な条件・進め方です。「わからない」は減点せず、回答がある設問だけで算出します。</p><p>出生図だけの項目は、回答から確認できた持ち味と区別しています。総合は望む稼ぎ方に関係する項目の加重平均です。</p><table className="al-table"><caption>回答と出生図の内訳</caption><thead><tr><th>項目</th><th>回答</th><th>出生図</th></tr></thead><tbody>{scores.profiles.map(p=><tr key={p.id}><td>{p.label}</td><td>{p.answerScore??'未確認'}</td><td>{p.chartScore}</td></tr>)}</tbody></table><p>採点ルール：{scores.version}</p></details>
    </section>
    <section className="al-careers" aria-labelledby="careers-title"><div className="al-section-heading"><p className="al-source-label">こんな役割で生かせそう</p><h3 id="careers-title">向いていそうな仕事の例</h3></div><div className="al-career-grid">{scores.careers.map((job,i)=><article className="al-career-card" key={job.id}><div className="al-career-meta"><span>0{i+1}</span><span>持ち味との重なり <strong>{job.score}</strong></span></div><h4>{job.title}</h4><p>{job.description}</p><div className="al-career-reason">{job.reason}</div></article>)}</div></section>
    <section className="al-one-step"><span className="al-source-label">まず、ひとつ試すなら</span><p>{byId('action').body[0]}</p><p className="al-small">{scores.styleHint}</p></section>
    {aiConnected&&<section className="al-ai-takeaway"><span className="al-source-label">あなたのことばから、見立てを更新</span><p>{byId('overlap').body[0]}</p></section>}
    {error&&<p className="al-error" role="alert">{error}</p>}
    <div className="al-work-actions"><button type="button" className="al-primary" disabled={busy} onClick={onDeepen}>{busy?'準備しています…':'自分のことばでもう少し深掘りする'}<ArrowRight size={16}/></button><button type="button" className="al-text-button" disabled={busy} onClick={onEditAnswers}><Pencil size={15}/>回答を変えてみる</button></div>
    <details className="al-result-detail"><summary>見立てに補足・訂正する</summary><ResultCard section={byId('overlap')} compact onRevise={onRevise} busy={busy}/><p className="al-small">補足は文章の見立てに反映します。スコアを変えたいときは選択回答を変更できます。</p>{revisions.length>0&&<p className="al-small">補足・訂正を{revisions.length}件反映済み。</p>}</details>
    <details className="al-result-detail"><summary>回答と出生図を見る</summary><dl className="al-answer-list">{QUESTIONS.map(q=><div key={q.id}><dt>{q.title}</dt><dd>{answerText(q,answers)}</dd></div>)}</dl><ChartFacts chart={chart}/><div className="al-editor-actions"><button type="button" className="al-secondary" onClick={onEditBirth} disabled={busy}>出生情報を変更する</button></div></details>
  </div>;
}
