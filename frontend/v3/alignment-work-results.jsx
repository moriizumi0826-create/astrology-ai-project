import React from 'react';
import { Pencil, ArrowRight } from 'lucide-react';
import { ResultCard } from './alignment-results.jsx';
import { ChartFacts } from './alignment-panels.jsx';
import { QUESTIONS, answerText } from './alignment-work-style.mjs';

function ProfileCard({ side, type, profiles }) {
  const isAnswer=side==='answer';
  const title=isAnswer?'自分の選択による結果':'出生図から見た資質';
  const field=isAnswer?'answerScore':'chartScore';
  return <section className={`al-profile-side al-profile-${side}`} aria-label={title}>
    <header className="al-profile-head"><span className="al-profile-source">{isAnswer?'あなたの回答':'出生図'}</span><p>{title}</p><h3>{type.label}</h3><span className="al-type-style">{type.style}</span></header>
    <div className="al-compare-metrics">{profiles.map(p=><div key={p.id} className="al-score-metric"><div><span>{p.label}</span><strong>{p[field]===null?'未確認':<>{p[field]}<small> / 100</small></>}</strong></div><div className="al-score-track" role={p[field]===null?undefined:'meter'} aria-label={`${title}：${p.label}`} aria-valuenow={p[field]??undefined} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${p[field]??0}%`}}/></div></div>)}</div>
  </section>;
}

export function WorkStyleResults({ scores, sections, answers, chart, busy, error, onDeepen, onRevise, onEditAnswers, onEditBirth, aiConnected, headingRef, revisions }) {
  const byId=id=>sections.find(s=>s.id===id);
  if(!scores.comparison) return <section><h2 id="al-step-title" ref={headingRef} tabIndex={-1}>結果を更新する</h2><button type="button" className="al-primary" disabled={busy} onClick={onEditBirth}>最新の結果を見る</button></section>;
  const comparison=scores.comparison;
  return <div className="al-results">
    <div className="al-results-heading"><p className="al-eyebrow">TWO VIEWS OF YOUR POTENTIAL</p><h2 ref={headingRef} tabIndex={-1} id="al-step-title">あなたの選択と、出生図の資質を見比べる。</h2></div>
    <section className="al-match-hero" aria-label="回答と出生図の一致度">
      <div className="al-match-dial" style={{'--match-score':`${comparison.level===null?0:comparison.level/comparison.maxLevel*100}%`}} role={comparison.level===null?undefined:'meter'} aria-label="一致度" aria-valuenow={comparison.level??undefined} aria-valuemin={0} aria-valuemax={99}><div><span>一致度</span><strong>{comparison.level===null?'—':<><small>Lv.</small>{comparison.level}</>}</strong></div></div>
      <div className="al-match-context"><h3>{comparison.summary?.title || '回答と出生図の傾向を見比べる'}</h3>{comparison.summary?.detail && <p>{comparison.summary.detail}</p>}{comparison.comparedDimensions<7&&<p className="al-small">比較できた項目：{comparison.comparedDimensions} / 7</p>}</div>
    </section>
    <div className="al-profile-comparison"><ProfileCard side="answer" type={scores.answerType} profiles={scores.profiles}/><ProfileCard side="chart" type={scores.chartType} profiles={scores.profiles}/></div>
    <section className="al-careers" aria-labelledby="careers-title"><div className="al-section-heading"><p className="al-source-label">出生図から見た、こんな役割で生かせそう</p><h3 id="careers-title">向いていそうな仕事の例</h3></div><div className="al-career-grid">{scores.careers.map((job,i)=><article className="al-career-card" key={job.id}><div className="al-career-meta"><span>0{i+1}</span><span>出生図との重なり <strong>{job.score}</strong></span></div><h4>{job.title}</h4><p>{job.description}</p><div className="al-career-reason">{job.reason}</div></article>)}</div></section>
    {aiConnected&&<section className="al-ai-takeaway"><span className="al-source-label">あなたのことばから、見立てを更新</span><p>{byId('overlap').body[0]}</p></section>}
    {error&&<p className="al-error" role="alert">{error}</p>}
    <div className="al-work-actions"><button type="button" className="al-primary" disabled={busy} onClick={onDeepen}>{busy?'準備しています…':'自分のことばでもう少し深掘りする'}<ArrowRight size={16}/></button><button type="button" className="al-text-button" disabled={busy} onClick={onEditAnswers}><Pencil size={15}/>回答を変えてみる</button></div>
    <details className="al-result-detail"><summary>見立てに補足・訂正する</summary><ResultCard section={byId('overlap')} compact onRevise={onRevise} busy={busy}/><p className="al-small">補足は文章の見立てに反映します。スコアを変えたいときは選択回答を変更できます。</p>{revisions.length>0&&<p className="al-small">補足・訂正を{revisions.length}件反映済み。</p>}</details>
    <details className="al-result-detail"><summary>回答と出生図を見る</summary><dl className="al-answer-list">{QUESTIONS.map(q=><div key={q.id}><dt>{q.title}</dt><dd>{answerText(q,answers)}</dd></div>)}</dl><ChartFacts chart={chart}/><div className="al-editor-actions"><button type="button" className="al-secondary" onClick={onEditBirth} disabled={busy}>出生情報を変更する</button></div></details>
  </div>;
}
