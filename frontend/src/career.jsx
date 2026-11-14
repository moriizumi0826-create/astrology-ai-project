import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { alignmentRequest } from './alignment-api.mjs';
import { PREFECTURES } from './alignment-prefectures.mjs';
import { birthPayload, EMPTY_BIRTH } from './alignment-session.mjs';
import { readCareer } from './career-reading.mjs';
import { CareerWheel } from './career-wheel.jsx';
import './career.css';

function Placement({ step }) {
  const { cusp, ruler, occupants, number } = step;
  return <div className="career-placement">
    <p>{number === 10 ? 'MC' : '入口'} {cusp.sign} {cusp.degree}°<span aria-hidden="true"> → </span>支配星は{ruler.name}</p>
    <p>{ruler.name}は{ruler.sign}・{ruler.house}ハウス</p>
    {occupants.length > 0 && <p>{number}ハウスに入る天体　{occupants.map(planet => planet.name).join('、')}</p>}
  </div>;
}

function Result({ result }) {
  const { birth, chart, reading } = result;
  const { quest, trainingSkill, role, outcome } = reading.profile;
  const heading = useRef(null);
  useEffect(() => { heading.current.focus(); }, [result]);
  return <article className="career-result" aria-labelledby="career-result-title">
    <header className="career-result-head">
      <p className="career-profile-label">出生図から見た初期ジョブ</p>
      <h2 id="career-result-title" ref={heading} tabIndex={-1}>{quest.job}</h2>
      <p>{birth.date.replace(/-/g, '/')} {birth.time} ・ {birth.prefecture}</p>
    </header>
    <ol className="career-profile">
      <li><h3>① 固有技</h3><strong>{quest.technique}</strong><p>{quest.signature}。</p></li>
      <li><h3>② 伸ばすスキル</h3><strong>{trainingSkill}</strong></li>
      <li><h3>③ 極めた先の役割</h3><strong>{role}</strong><p>示したい実績は、{outcome}。</p></li>
    </ol>
    <div className="career-quest-grid">
      <section className="career-example career-quest">
        <p className="career-quest-label">レベル上げクエスト</p>
        <h3>{quest.title}</h3>
        <p>{quest.mission}</p>
        <p><strong>攻略のヒント</strong>　{quest.practice}。</p>
        <p><strong>クリア条件</strong>　{quest.clear}。</p>
      </section>
      <section className="career-example">
        <p className="career-quest-label">現実の仕事で試すなら</p>
        <h3>{quest.workTitle}</h3>
        <p>{quest.workAction}。</p>
        <p><strong>成果の見方</strong>　{quest.measure}を記録して、工夫する前後で比べる。</p>
      </section>
    </div>
    <h3 className="career-basis-title">出生図で根拠を見る</h3>
    <div className="career-diagram">
      <CareerWheel chart={chart} reading={reading} />
      <ol className="career-steps">
        {reading.steps.map(step => <li key={step.number} className={`career-step ${step.tone}`}>
          <h3><span aria-hidden="true">{step.badge}</span> {step.title} <small>{step.label}</small></h3>
          <p className="career-step-result">{step.result}</p>
          <p>{step.detail}</p>
          <Placement step={step} />
          {step.number === 10 && reading.nearMc.length > 0 &&
            <p className="career-mc">MCの近く（3°以内）　{reading.nearMc.map(planet =>
              `${planet.name} ${planet.distance.toFixed(2)}°`).join('、')}</p>}
        </li>)}
      </ol>
    </div>
    <p className="career-method">トロピカル・プラシーダス方式／伝統的支配星／都道府県の代表座標で計算</p>
    <section className="career-followup">
        <h3>配置のつながり</h3>
        <dl>{reading.connections.map(({ label, facts }) => <div key={label}>
          <dt>{label}</dt>
          {facts.length > 0 ? facts.map(fact => <dd key={fact}>{fact}</dd>) :
            <dd>支配星の共通・相互のハウスへの在室・支配星同士のアスペクトは、今回の読みでは見つかりませんでした。</dd>}
        </div>)}</dl>
    </section>
  </article>;
}

function App() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format();

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const birth = Object.fromEntries(new FormData(event.currentTarget));
    setError('');
    setBusy(true);
    try {
      const chart = await alignmentRequest('/api/alignment/chart', birthPayload(birth, today));
      setResult({ chart, birth, reading: readCareer(chart) });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return <main className="career-page">
    <a className="career-back" href="./index.html">← The Celestial Atelier</a>
    <header className="career-intro">
      <h1>向いている仕事を、どう極める？</h1>
      <p>出生図の2ハウス、6ハウス、10ハウス・MCから、稼ぐ持ち味とその育て方を探ります。</p>
    </header>
    <form className="career-form" onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy}>
        <label>生年月日<input name="date" type="date" min="1900-01-01" max={today} required /></label>
        <label>出生時刻<input name="time" type="time" required /></label>
        <label>出生地<select name="prefecture" defaultValue={EMPTY_BIRTH.prefecture}>
          {PREFECTURES.map(({ name }) => <option key={name}>{name}</option>)}
        </select></label>
        <button type="submit">{busy ? '計算中…' : '出生図で見る'}</button>
      </fieldset>
      {busy && <p role="status" className="career-status">出生図を計算しています。</p>}
      {error && <p role="alert" className="career-error">{error}</p>}
    </form>
    {result && <Result result={result} />}
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
