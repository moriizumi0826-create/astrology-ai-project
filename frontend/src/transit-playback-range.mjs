import { buildTransitPlaybackDates } from "./transit-chart-preload.mjs";

export function customPlaybackDates(start, end, availableDates = null) {
  const parse = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
  };
  const first = parse(start);
  const last = parse(end);
  if (!Number.isFinite(first) || !Number.isFinite(last)) throw new Error("開始日と終了日を入力してください。");
  if (last <= first) throw new Error("終了日は開始日より後の日付を選んでください。");
  const count = (last - first) / 86400000 + 1;
  if (count > 366) throw new Error("再生期間は開始日・終了日を含めて366日以内で指定してください。");
  const dates = buildTransitPlaybackDates(start, count);
  if (availableDates && dates.some((date) => !availableDates.includes(date))) {
    throw new Error("表示できる日付の範囲内で期間を指定してください。");
  }
  return dates;
}

export function samplePlaybackDates(dates, step) {
  const sampled = dates.filter((_, index) => index % step === 0);
  const end = dates.at(-1);
  if (end && sampled.at(-1) !== end) sampled.push(end);
  return sampled;
}
