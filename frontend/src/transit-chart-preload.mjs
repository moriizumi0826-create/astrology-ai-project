export function buildTransitPlaybackDates(startDate, count) {
  const start = new Date(`${startDate}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isInteger(count) || count < 1) return [];
  return Array.from({ length: count }, (_, index) => {
    const current = new Date(start);
    current.setUTCDate(current.getUTCDate() + index);
    return current.toISOString().slice(0, 10);
  });
}

function validateCharts(charts, dates, targetTime) {
  if (!Array.isArray(charts) || charts.length !== dates.length || charts.some((chart, i) =>
    chart?.date !== dates[i] || chart.time !== targetTime || !Array.isArray(chart.transits) || !Array.isArray(chart.house_cusps))) {
    throw new Error("再生用の天体データが揃っていません。再度お試しください。");
  }
}

// Shared by PC/mobile playback. No requests run until this function is called.
export async function preloadTransitCharts({ dates, targetTime, cache, cacheKey, request, formPayload, onProgress }) {
  const uniqueDates = [...new Set(dates)];
  const missing = uniqueDates.filter((date) => !cache.has(cacheKey(date, targetTime)));
  const report = () => onProgress?.(dates.filter((date) => cache.has(cacheKey(date, targetTime))).length, dates.length);
  onProgress?.(0, dates.length);
  if (!missing.length) {
    report();
    return;
  }
  if (!formPayload) throw new Error("出生データが見つかりません。");
  report();
  // Bound large paid-version ranges while keeping a month in one request.
  for (let index = 0; index < missing.length; index += 366) {
    const targetDates = missing.slice(index, index + 366);
    let charts;
    try {
      const response = await request("/api/transit-charts", { ...formPayload, target_time: targetTime, target_dates: targetDates });
      charts = response?.charts;
    } catch (error) {
      // Frontend/backend may be deployed at different times. Only fall back for
      // an unavailable endpoint, not validation, capacity or calculation errors.
      if (![404, 405].includes(error?.status)) throw error;
      charts = [];
      for (let offset = 0; offset < targetDates.length; offset += 4) {
        const groupDates = targetDates.slice(offset, offset + 4);
        const group = await Promise.all(groupDates.map((date) =>
          request("/api/transit-chart", { ...formPayload, target_date: date, target_time: targetTime })));
        validateCharts(group, groupDates, targetTime);
        for (const chart of group) {
          cache.set(cacheKey(chart.date, targetTime), chart);
        }
        charts.push(...group);
        report();
      }
    }
    validateCharts(charts, targetDates, targetTime);
    for (const chart of charts) cache.set(cacheKey(chart.date, targetTime), chart);
    report();
  }
}
