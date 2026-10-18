export function isRetrograde(item) {
  if (!item || item.estimated) return false;
  return item.retrograde === true || item.retrograde === 1 || ['true','1','r','retrograde','逆行'].includes(String(item.retrograde ?? '').trim().toLowerCase());
}
export const retrogradeSuffix = item => isRetrograde(item) ? '〔逆行〕' : '';

// Use the current keyframe's factual flag until the next keyframe is reached.
export function playbackMotion(fromChart, toChart, planet, progress) {
  const chart = progress >= 1 ? toChart : fromChart;
  return isRetrograde(chart?.transits?.find(item => item.planet === planet));
}

export function drawRetrogradeMarker(ctx) {
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowBlur = 0; ctx.lineWidth = 5;
  ctx.strokeStyle = '#101827'; ctx.fillStyle = '#ffb066';
  ctx.strokeText('R', 150, 30); ctx.fillText('R', 150, 30);
}
