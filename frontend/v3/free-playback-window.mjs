export const FREE_PLAYBACK_DAYS_BEFORE_TODAY = 15;
export const FREE_PLAYBACK_DAYS_AFTER_TODAY = 15;
export const FREE_PLAYBACK_WINDOW_DAYS = FREE_PLAYBACK_DAYS_BEFORE_TODAY + FREE_PLAYBACK_DAYS_AFTER_TODAY + 1;

function normalizedDateKey(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
  ) return "";
  return `${year}-${month}-${day}`;
}

function addUtcDays(value, days) {
  const normalized = normalizedDateKey(value);
  if (!normalized) return "";
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function buildFreePlaybackDates(todayDate) {
  const anchorDate = normalizedDateKey(todayDate);
  if (!anchorDate) return [];
  return Array.from({ length: FREE_PLAYBACK_WINDOW_DAYS }, (_, index) => (
    addUtcDays(anchorDate, index - FREE_PLAYBACK_DAYS_BEFORE_TODAY)
  ));
}
