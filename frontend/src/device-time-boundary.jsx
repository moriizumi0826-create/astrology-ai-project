import React, { useEffect, useState } from "react";
import { deviceClockKey, deviceTimezone, isSameDisplayTimezone } from "./device-time.mjs";
import { getStoredReadingForm, getStoredReadingResultAsync, isStoredResultFresh, storeReadingResult } from "./reading-storage.js";

const refreshRequests = new Map();
function refreshForClock(clock, form, refreshReading) {
  const key = JSON.stringify([clock, form]);
  if (!refreshRequests.has(key)) {
    const request = Promise.resolve().then(() => refreshReading("/api/readings?defer_widgets=true", form));
    refreshRequests.set(key, request);
    const clear = () => { if (refreshRequests.get(key) === request) refreshRequests.delete(key); };
    request.then(clear, clear);
  }
  return refreshRequests.get(key);
}

// Rebuild date-dependent UI and caches at local midnight or after travel.
// Birth inputs stay intact. No navigation/reload and no automatic geolocation.
export function DeviceTimeBoundary({ children, refreshReading }) {
  const [clock, setClock] = useState(deviceClockKey);
  const [ready, setReady] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const check = () => setClock(deviceClockKey());
    const timer = window.setInterval(check, 30000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  useEffect(() => {
    let active = true;
    setError("");
    (async () => {
      const stored = await getStoredReadingResultAsync({ allowStale: true });
      const form = getStoredReadingForm();
      if (form && (!stored || !isStoredResultFresh(stored))) {
        const result = await refreshForClock(clock, form, refreshReading);
        if (result?.meta?.display_timezone_name !== deviceTimezone()) {
          throw new Error("APIが表示用タイムゾーンに未対応です。バックエンドの更新後に再試行してください。");
        }
        if (!active || clock !== deviceClockKey()) return;
        if (stored && isSameDisplayTimezone(stored)) {
          const yearly = stored.yearly_forecast || stored.yearlyForecast;
          if (yearly) result.yearly_forecast = yearly;
        }
        await storeReadingResult(result);
      }
      if (active) setReady(clock);
    })().catch((failure) => {
      if (active) setError(failure?.message || "現地時間に合わせたデータの更新に失敗しました。");
    });
    return () => { active = false; };
  }, [clock, retry, refreshReading]);
  if (ready !== clock || error) return (
    <main className="min-h-screen bg-[#05070f] p-8 text-[#f3f3f0]">
      <p role={error ? "alert" : "status"}>{error || `現地時間（${deviceTimezone()}）に合わせて読み込んでいます…`}</p>
      {error ? <button className="mt-4 rounded border px-4 py-2" onClick={() => setRetry((value) => value + 1)}>再試行</button> : null}
    </main>
  );
  return React.cloneElement(children, { key: clock });
}
