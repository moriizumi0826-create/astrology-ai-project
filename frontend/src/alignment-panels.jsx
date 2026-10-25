import React from 'react';
import { PREFECTURES, prefectureLocation } from './alignment-prefectures.mjs';
import { chartEvidence } from './alignment-session.mjs';

export function BirthFields({ birth, today, updateBirth }) {
  const location = prefectureLocation(birth.prefecture);
  return <>
    <div className="al-birth-grid"><label className="al-field">生年月日<input type="date" required min="1900-01-01" max={today} value={birth.date} onChange={e => updateBirth({ date: e.target.value })} /></label><label className="al-field">出生時刻（必須）<input type="time" required value={birth.time} onChange={e => updateBirth({ time: e.target.value })} /></label></div>
    <label className="al-field">出生地（都道府県）<select aria-label="出生地（都道府県）" required value={birth.prefecture} onChange={e => updateBirth({ prefecture: e.target.value })}>{PREFECTURES.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}</select></label>
    <p className="al-small">出生地は{location?.capital}の代表座標で概算します。</p>
  </>;
}

export function ChartFacts({ chart }) {
  return <details className="al-details"><summary>計算した出生図と条件を見る</summary><p className="al-small">{chart.source}／{chart.house_system}／伝統的支配星／UTC{chart.timezone_offset >= 0 ? '+' : ''}{chart.timezone_offset}</p>{chart.limitations?.map((text, i) => <p className="al-small" key={i}>{text}</p>)}{chartEvidence(chart).map(f => <p className="al-small" key={f.id}>{f.text}</p>)}<div className="al-table-wrap"><table className="al-table"><caption>10天体の計算結果</caption><thead><tr><th>天体</th><th>サイン</th><th>度数</th><th>ハウス</th></tr></thead><tbody>{chart.planets.map(p => <tr key={p.name}><td>{p.name}</td><td>{p.sign}</td><td>{p.degree}°</td><td>{p.house || '不明'}</td></tr>)}</tbody></table></div><details className="al-details"><summary>アスペクトと採用オーブ</summary>{chart.aspects.map((a, i) => <p className="al-small" key={i}>{a.planet1} × {a.planet2}：{a.name}（{a.angle}°）／実角度 {a.separation}°／オーブ {a.orb}°</p>)}{chart.aspect_rules?.map(a => <p className="al-small" key={a.angle}>{a.name}：{a.angle}° ±{a.orb}°</p>)}</details></details>;
}
