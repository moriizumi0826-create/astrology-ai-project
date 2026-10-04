function dateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("イベントの日付を確認できません。");
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("イベントの日付を確認できません。");
  return date;
}

function utcStamp(date) { return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z"); }

// Opens Google's event editor only; it does not save or read the user's calendar.
export function googleCalendarEventUrl(event, timeZone = "UTC") {
  new Intl.DateTimeFormat("en", { timeZone }); // reject unknown zones, do not silently change the date
  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", String(event.title || "天体イベント"));
  url.searchParams.set("ctz", timeZone);
  const value = String(event.event_utc_datetime || event.event_datetime || "");
  if (value) {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/);
    if (!match) throw new Error("イベントの時刻を確認できません。");
    dateKey(match[1]);
    if (+match[2] > 23 || +match[3] > 59 || +(match[4] || 0) > 59) throw new Error("イベントの時刻を確認できません。");
    const start = new Date(match[5] ? value : `${value}Z`);
    if (!Number.isFinite(start.getTime())) throw new Error("イベントの時刻を確認できません。");
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    // Offset-aware times are absolute. Legacy times without an offset are local to ctz.
    const stamp = match[5] ? utcStamp : date => utcStamp(date).slice(0, -1);
    url.searchParams.set("dates", `${stamp(start)}/${stamp(end)}`);
    url.searchParams.set("details", `${String(event.note || "")}\n\nThe Celestial Atelier の天体イベント。予定の長さは30分です（天体の影響期間ではありません）。Google側で変更できます。`.trim());
  } else {
    const start = dateKey(String(event.event_date || ""));
    const end = new Date(start.getTime() + 86400000);
    url.searchParams.set("dates", `${utcStamp(start).slice(0, 8)}/${utcStamp(end).slice(0, 8)}`);
    url.searchParams.set("details", `${String(event.note || "")}\n\nThe Celestial Atelier の天体イベント。時刻情報がないため終日予定です。`.trim());
  }
  return url.href;
}
