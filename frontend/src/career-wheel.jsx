import React from 'react';
import { SIGNS } from './career-reading.mjs';

const CENTER = 260;
const OUTER = 218;
const INNER = 54;
const COLORS = { teal: '#00665f', gold: '#9a5416', tealBg: '#ddeee8', goldBg: '#f6e9d2' };
const arc = (from, to) => (to - from + 360) % 360;

export function CareerWheel({ chart, reading }) {
  const cusps = chart.houses;
  const asc = cusps[0].longitude;
  const mc = reading.steps[2].cusp.longitude;
  const point = (longitude, radius) => {
    const angle = (180 + longitude - asc) * Math.PI / 180;
    return [CENTER + radius * Math.cos(angle), CENTER - radius * Math.sin(angle)];
  };
  const segment = (longitude, from, to, props) => {
    const [x1, y1] = point(longitude, from);
    const [x2, y2] = point(longitude, to);
    return <line x1={x1} y1={y1} x2={x2} y2={y2} {...props} />;
  };
  const wedge = (start, end) => {
    const wide = Number(arc(start, end) > 180);
    return `M ${point(start, OUTER)} A ${OUTER} ${OUTER} 0 ${wide} 0 ${point(end, OUTER)}
      L ${point(end, INNER)} A ${INNER} ${INNER} 0 ${wide} 1 ${point(start, INNER)} Z`;
  };

  // Keep a shared ruler at one position. Offset overlapping labels while retaining the true dots.
  const markers = new Map();
  for (const step of reading.steps) {
    const current = markers.get(step.ruler.name);
    if (current) current.badges.push(step.badge);
    else markers.set(step.ruler.name, { ...step.ruler, tone: step.tone, badges: [step.badge] });
  }
  for (const planet of reading.nearMc) {
    if (!markers.has(planet.name)) markers.set(planet.name, { ...planet, tone: 'gold', badges: ['③'] });
  }
  const occupied = [];
  const labels = [...markers.values()].map(marker => {
    const text = marker.badges.join('') + ' ' + marker.name;
    const width = 22 + 15 * (marker.badges.length + marker.name.length);
    const fits = (x, y) => x - width / 2 >= 12 && x + width / 2 <= 508 &&
      occupied.every(other => Math.abs(x - other.x) >= (width + other.width) / 2 + 4 || Math.abs(y - other.y) > 27);
    let position;
    for (const radius of [146, 115, 178]) {
      for (const offset of [0, 14, -14, 28, -28, 42, -42]) {
        const [x, y] = point(marker.longitude + offset, radius);
        if (fits(x, y)) {
          position = { x, y, width };
          break;
        }
      }
      if (position) break;
    }
    if (position) occupied.push(position);
    return { ...marker, text, position };
  });

  return <svg className="career-wheel" viewBox="0 0 520 520" role="img" aria-labelledby="career-wheel-title">
    <title id="career-wheel-title">2・6・10ハウス、支配星、MCの位置</title>
    {cusps.map((cusp, i) => {
      const end = cusps[(i + 1) % 12].longitude;
      const step = reading.steps.find(item => item.number === cusp.number);
      return step && <path key={cusp.number} d={wedge(cusp.longitude, end)} fill={COLORS[step.tone + 'Bg']} />;
    })}
    {[INNER, OUTER, 248].map(radius => <circle key={radius} cx={CENTER} cy={CENTER} r={radius} fill="none" stroke="#a8b1bf" />)}
    {cusps.map((cusp, i) => {
      const step = reading.steps.find(item => item.number === cusp.number);
      const middle = cusp.longitude + arc(cusp.longitude, cusps[(i + 1) % 12].longitude) / 2;
      const [x, y] = point(middle, 77);
      const color = step ? COLORS[step.tone] : '#425471';
      return <g key={cusp.number}>
        {segment(cusp.longitude, INNER, OUTER, { stroke: step ? color : '#a8b1bf', strokeWidth: step ? 2.6 : 1 })}
        <text x={x} y={y} fill={color} className={step ? 'wheel-active' : undefined}>{step?.badge}{cusp.number}</text>
      </g>;
    })}
    {SIGNS.map((sign, i) => {
      const [x, y] = point(i * 30 + 15, 233);
      return <g key={sign}>
        {segment(i * 30, OUTER, 248, { stroke: '#a8b1bf' })}
        <text x={x} y={y} fill="#425471">{sign.slice(0, -1)}</text>
      </g>;
    })}
    <text x={CENTER} y={CENTER} fill="#425471" className="wheel-active">出生図</text>
    {segment(mc, 184, OUTER, { stroke: COLORS.gold, strokeWidth: 3 })}
    {(() => {
      const [x, y] = point(mc, 205);
      return <g><rect x={x - 18} y={y - 11} width="36" height="22" rx="5" fill={COLORS.gold} />
        <text x={x} y={y} fill="white" className="wheel-active">MC</text></g>;
    })()}
    {labels.map(({ name, longitude, tone, text, position }) => {
      const [x, y] = point(longitude, 170);
      const color = COLORS[tone];
      return <g key={name}>
        <title>{text}</title>
        {position && <line x1={x} y1={y} x2={position.x} y2={position.y} stroke={color} />}
        <circle cx={x} cy={y} r="4.5" fill={color} stroke="white" />
        {position && <>
          <rect x={position.x - position.width / 2} y={position.y - 11} width={position.width} height="22" rx="5" fill={color} />
          <text x={position.x} y={position.y} fill="white" className="wheel-active">{text}</text>
        </>}
      </g>;
    })}
  </svg>;
}
