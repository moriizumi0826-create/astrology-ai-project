export function retrogradeState(item) {
  if (!item || item.estimated || item.retrograde == null) return null;
  const value=String(item.retrograde).trim().toLowerCase();
  if (['true','1','r','retrograde','逆行'].includes(value)) return true;
  if (['false','0','d','direct','順行'].includes(value)) return false;
  return null;
}
export const isRetrograde = item => retrogradeState(item) === true;
export const retrogradeSuffix = item => isRetrograde(item) ? '〔逆行〕' : '';

// Use the current keyframe's factual flag until the next keyframe is reached.
export function playbackMotion(fromChart, toChart, planet, progress) {
  const chart = progress >= 1 ? toChart : fromChart;
  return retrogradeState(chart?.transits?.find(item => item.planet === planet));
}

export function drawRetrogradeMarker(ctx) {
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowBlur = 0; ctx.lineWidth = 5;
  ctx.strokeStyle = '#101827'; ctx.fillStyle = '#ffb066';
  ctx.strokeText('R', 150, 30); ctx.fillText('R', 150, 30);
}
