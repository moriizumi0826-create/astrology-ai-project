import React from "react";
import { deviceTimezone } from "../src/device-time.mjs";
import { googleCalendarEventUrl } from "./google-calendar.mjs";

export function GoogleCalendarButton({ event }) {
  let href;
  try { href = googleCalendarEventUrl(event, deviceTimezone()); }
  catch { return <p className="mt-3 text-xs text-mist">日時を確認できないため、Googleカレンダーへ追加できません。</p>; }
  return <div className="mt-3 border-t border-white/10 pt-3">
    <a href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center rounded-lg border border-gold/40 px-3 py-2 text-xs font-semibold text-gold hover:bg-gold/10">Googleカレンダーに追加 ↗</a>
    <p className="mt-2 text-[11px] leading-5 text-mist">イベントのタイトル・日時・説明をGoogleに渡します。Google側で内容を確認して保存してください。自動同期は行いません。</p>
  </div>;
}
