import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AccessContext } from "./access-context.jsx";
import { BirthDataEditor } from "./birth-data-editor.jsx";
import { FreeHoroscopeContent } from "./free-horoscope-content.jsx";
import { Horoscope3DMap } from "./horoscope-map.jsx";
import { DeviceTimeBoundary } from "../src/device-time-boundary.jsx";
import { configureStorage, freeResult, getStoredReadingForm, getStoredReadingResult, storeReadingForm, storeReadingResult } from "./reading-storage.js";
import { getJson, postJson, searchBirthLocations } from "./api.mjs";
import background from "../src/assets/daily-detail-galaxy-bg.jpg";
import { mountAuthControls } from "./auth-controls.js";
import { featurePolicy } from "./feature-policy.mjs";
import { prepareSession, saveMemberProfile } from "./profile.mjs";
import { isMemberMode } from "./auth-client.mjs";

const PaidForecast = lazy(() => import("./paid-forecast.jsx"));

function Horoscope({ onForecast, session }) {
  const { stellarForecast } = featurePolicy(session);
  const [result, setResult] = useState(() => freeResult(getStoredReadingResult({ allowStale: true })));
  const [revision, setRevision] = useState(0);
  const [locked, setLocked] = useState(false);
  const recalculate = async ({ request, snapshot }) => {
    const next = await postJson("/api/readings", request);
    await saveMemberProfile(snapshot);
    storeReadingForm(snapshot);
    await storeReadingResult(next);
    setResult(freeResult(next));
    setRevision(value => value + 1);
  };
  const data = { ...result, ...result.dashboard_data };
  return <div className="min-h-screen text-starlight">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#121414] px-5 py-4">
      <a href="/entry.html" className="font-serif text-xl text-gold">The Celestial Atelier</a>
      <nav className="flex gap-5 text-sm"><span>Horoscope</span><button onClick={() => stellarForecast ? onForecast() : setLocked(true)}>星の見通し{!stellarForecast ? " 🔒" : ""}</button></nav>
    </header>
    <div style={{ backgroundImage: `linear-gradient(#05070f66,#05070f99),url(${background})`, backgroundSize: "cover", backgroundAttachment: "fixed" }}>
      <FreeHoroscopeContent data={data} belowMetaContent={<>
        {isMemberMode() && session.user_id && <p className="px-4 text-xs text-white/60">再計算の完了時に、変更した出生情報をアカウントへ保存します。</p>}
        <BirthDataEditor initialForm={getStoredReadingForm() || {}} meta={result.meta} onSearchLocations={searchBirthLocations} onRecalculate={recalculate} />
        <Horoscope3DMap key={`map-${revision}`} data={data} />
      </>} />
    </div>
    {locked && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-5"><section role="dialog" aria-modal="true" aria-label="有料版のご案内" className="max-w-md rounded-2xl border border-gold/30 bg-midnight p-7"><h2 className="text-xl text-gold">星の見通しは有料版限定です</h2><p className="my-4 text-sm leading-7">{isMemberMode() ? "月額プランに登録すると、星の見通しと有料版の3Dマップ機能を利用できます。" : "テストログインで有料版を確認できます。実際の課金は発生しません。"}</p>{isMemberMode() ? <a className="mr-4 text-gold underline" href="/billing.html">有料プランを見る</a> : <a className="mr-4 text-gold underline" href="/login.html">テストログイン</a>}<button className="rounded border px-4 py-2" onClick={() => setLocked(false)}>閉じる</button></section></div>}
  </div>;
}

function Workspace({ session }) {
  const { stellarForecast } = featurePolicy(session);
  const [view, setView] = useState(() => location.hash === "#horoscope" || !stellarForecast ? "horoscope" : "forecast");
  const [paidReady, setPaidReady] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const navigate = next => { setPaidReady(false); location.hash = next; setView(next); };
  useEffect(() => {
    const syncView = () => {
      setPaidReady(false);
      setView(location.hash === "#forecast" && stellarForecast ? "forecast" : "horoscope");
    };
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, [stellarForecast]);
  useEffect(() => {
    if (view !== "forecast" || !stellarForecast) return;
    let active = true;
    setPaidReady(false);
    setError("");
    postJson("/api/paid-reading?defer_widgets=true", getStoredReadingForm()).then(async result => {
      if (!active) return;
      await storeReadingResult(result);
      if (active) setPaidReady(true);
    }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [view, stellarForecast, retry]);
  if (view === "forecast" && stellarForecast) {
    if (error) return <section className="p-8"><p role="alert">{error}</p><button onClick={() => setRetry(value => value + 1)}>再試行</button><button className="ml-5" onClick={() => navigate("horoscope")}>Horoscopeへ戻る</button></section>;
    return paidReady ? <Suspense fallback={<p className="p-8" role="status">星の見通しを読み込んでいます…</p>}><PaidForecast onHoroscope={() => navigate("horoscope")} /></Suspense> : <p className="p-8" role="status">星の見通しの計算を開始しています…</p>;
  }
  return <Horoscope session={session} onForecast={() => navigate("forecast")} />;
}

function App() {
  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const refresh = async () => {
    try {
      const next = await prepareSession();
      configureStorage(next);
      if (!getStoredReadingForm()) { location.replace("/entry.html"); return; }
      setSession(next); setError("");
    } catch (failure) { configureStorage(null); setSession(null); setError(failure.message); }
  };
  useEffect(() => { refresh(); const timer = setInterval(refresh, 30000); window.addEventListener("focus", refresh); return () => { clearInterval(timer); window.removeEventListener("focus", refresh); }; }, []);
  useEffect(() => {
    const changed = () => { configureStorage(null); setSession(null); location.replace("/login.html"); };
    window.addEventListener("v3-auth-changed", changed);
    return () => window.removeEventListener("v3-auth-changed", changed);
  }, []);
  useEffect(() => session ? mountAuthControls(session) : undefined, [session?.user_id, session?.state]);
  useEffect(() => {
    if (session?.state !== "paid") return;
    const remaining = Date.parse(session.valid_until) - Date.now();
    const timer = setTimeout(() => {
      const checking = { ...session, state: "checking", capabilities: {} };
      configureStorage(checking);
      setSession(checking); // remove paid UI/caches before asynchronous revalidation
      refresh();
    }, Math.min(Math.max(Number.isFinite(remaining) ? remaining : 0, 0) + 1, 2147483647));
    return () => clearTimeout(timer);
  }, [session?.state, session?.valid_until]);
  if (error) return <section className="p-8"><p role="alert">{error}</p><button onClick={refresh}>再試行</button><a className="ml-5 underline" href="/login.html">ログイン画面へ</a></section>;
  if (!session) return <p className="p-8" role="status">利用状態を確認しています…</p>;
  return <AccessContext.Provider value={{ session }}><DeviceTimeBoundary key={`${session.user_id}:${session.state}`} refreshReading={postJson}><Workspace session={session} /></DeviceTimeBoundary><div className="fixed bottom-1 left-1 z-[250] rounded bg-black/80 px-2 py-1 text-[10px] text-white/60">{isMemberMode() ? "V3 テスト公開" : "V3 ローカル検証"}</div></AccessContext.Provider>;
}

const root = import.meta.hot?.data.root || createRoot(document.getElementById("forecast-detail-root"));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<App />);
