import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import "./tailwind.css";
import { Menu } from "lucide-react";
import { createRoot } from "react-dom/client";
import { AccountControls } from "./account-controls.jsx";
import { CalendarWorkspace, useCalendarNotes } from "./calendar-workspace.jsx";
import { AccessContext } from "./access-context.jsx";
import { BirthDataEditor } from "./birth-data-editor.jsx";
import { FreeHoroscopeContent } from "./free-horoscope-content.jsx";
import { Horoscope3DMap } from "./horoscope-map.jsx";
import { DeviceTimeBoundary } from "../src/device-time-boundary.jsx";
import { configureStorage, freeResult, getStoredReadingForm, getStoredReadingResult, storeReadingResult } from "./reading-storage.js";
import { getJson, postJson, searchBirthLocations } from "./api.mjs";
import background from "../src/assets/daily-detail-galaxy-bg.jpg";
import { featurePolicy } from "./feature-policy.mjs";
import { prepareSession } from "./profile.mjs";
import { isMemberMode } from "./auth-client.mjs";

const PaidForecast = lazy(() => import("./paid-forecast.jsx"));

function Horoscope({ onForecast, session }) {
  const calendarNotes = useCalendarNotes();
  const { stellarForecast } = featurePolicy(session);
  const [result, setResult] = useState(() => freeResult(getStoredReadingResult({ allowStale: true })));
  const [revision, setRevision] = useState(0);
  const [chartForm, setChartForm] = useState(() => getStoredReadingForm() || {});
  const [locked, setLocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const recalculate = async ({ request, snapshot }) => {
    const next = await postJson("/api/readings", request);
    // Another person's chart is local to this Horoscope view, not the member profile or forecast.
    setChartForm(snapshot);
    setResult(freeResult(next));
    setRevision(value => value + 1);
  };
  const data = useMemo(() => ({ ...result, ...result.dashboard_data }), [result]);
  return <div className="min-h-screen text-starlight">
    <header className="fixed left-0 top-0 z-40 w-full border-b border-slate-200/90 bg-[#f8fafc]/95 backdrop-blur-xl">
      <div className="flex w-full max-w-none flex-wrap items-center justify-between gap-2 px-3 py-2 sm:gap-6 sm:px-8 sm:py-6 lg:mx-auto lg:max-w-[1760px]">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none sm:gap-8">
          <a href="/entry.html" className="max-w-[66px] font-serif text-[11px] font-bold leading-[0.98] text-[#0A192F] sm:max-w-none sm:text-4xl sm:leading-none">The Celestial Atelier</a>
          <button
            type="button"
            onClick={() => setMenuOpen(value => !value)}
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0A192F] shadow-sm transition ${menuOpen ? "ring-1 ring-[#D4AF37]/45" : "hover:bg-[#fff7df] hover:text-[#D4AF37]"}`}
            aria-expanded={menuOpen}
            aria-controls="v3-workspace-nav"
            aria-label="ナビゲーションを開く"
            title="メニュー"
          >
            <Menu size={15} />
          </button>
        </div>
        <AccountControls session={session} />
        <nav
          id="v3-workspace-nav"
          className={`order-last w-full items-center gap-5 overflow-x-auto border-t border-slate-200 pt-3 font-mono text-[10px] font-bold tracking-[0.1em] text-[#0A192F]/70 transition-all [scrollbar-width:none] sm:text-xs lg:gap-10 lg:tracking-[0.12em] ${menuOpen ? "flex max-h-20 opacity-100" : "hidden max-h-0 opacity-0"}`}
        >
          <button
            type="button"
            className={`pb-2 transition sm:pb-3 ${stellarForecast ? "hover:text-[#D4AF37]" : "text-[#0A192F]/45"}`}
            onClick={() => { setMenuOpen(false); stellarForecast ? onForecast() : setLocked(true); }}
            aria-disabled={!stellarForecast}
          >
            星の見通し{!stellarForecast ? " 🔒" : ""}
          </button>
          <button type="button" className="border-b-2 border-[#D4AF37] pb-2 text-[#0A192F] sm:pb-3" onClick={() => setMenuOpen(false)}>Horoscope</button>
        </nav>
      </div>
    </header>
    <div className="pt-[56px] sm:pt-36" style={{ backgroundImage: `linear-gradient(#05070f66,#05070f99),url(${background})`, backgroundSize: "cover", backgroundAttachment: "fixed" }}>
      <FreeHoroscopeContent data={data} belowMetaContent={<>
        <BirthDataEditor initialForm={chartForm} meta={result.meta} onSearchLocations={searchBirthLocations} onRecalculate={recalculate} />
        <button type="button" className="mb-3 rounded border border-gold/30 px-4 py-2 text-sm text-gold" onClick={()=>calendarNotes.openCalendar()} disabled={!session?.user_id}>
          {stellarForecast ? "天体イベントカレンダー・メモ" : session?.user_id ? "保存済みメモ（閲覧・削除）" : "🔒 カレンダー・メモ"}
        </button>
        <Horoscope3DMap key={`map-${revision}`} data={data} birthForm={chartForm} />
      </>} />
    </div>
    {locked && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-5"><section role="dialog" aria-modal="true" aria-label="有料版のご案内" className="max-w-md rounded-2xl border border-gold/30 bg-midnight p-7"><h2 className="text-xl text-gold">星の見通しは有料版限定です</h2><p className="my-4 text-sm leading-7">{isMemberMode() ? "月額プランに登録すると、星の見通しと有料版の3Dマップ機能を利用できます。" : "ログインすると有料版を確認できます。"}</p>{isMemberMode() ? <a className="mr-4 text-gold underline" href="/billing.html">有料プランを見る</a> : <a className="mr-4 text-gold underline" href="/login.html">ログイン</a>}<button className="rounded border px-4 py-2" onClick={() => setLocked(false)}>閉じる</button></section></div>}
  </div>;
}

function Workspace({ session }) {
  const { stellarForecast } = featurePolicy(session);
  const initialView = location.hash === "#horoscope" || !stellarForecast ? "horoscope" : "forecast";
  const [view, setView] = useState(initialView);
  const [paidRequested, setPaidRequested] = useState(initialView === "forecast");
  const [paidReady, setPaidReady] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const navigate = next => {
    if (next === "forecast" && stellarForecast) setPaidRequested(true);
    location.hash = next;
    setView(next);
  };
  useEffect(() => {
    const syncView = () => {
      const next = location.hash === "#forecast" && stellarForecast ? "forecast" : "horoscope";
      if (next === "forecast") setPaidRequested(true);
      setView(next);
    };
    window.addEventListener("hashchange", syncView);
    return () => window.removeEventListener("hashchange", syncView);
  }, [stellarForecast]);
  useEffect(() => {
    if (!paidRequested || !stellarForecast || paidReady) return;
    let active = true;
    setError("");
    postJson("/api/paid-reading?defer_widgets=true", getStoredReadingForm()).then(async result => {
      if (!active) return;
      await storeReadingResult(result);
      if (active) setPaidReady(true);
    }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [paidRequested, stellarForecast, retry]);
  return <>
    <div hidden={view !== "horoscope"}>
      <Horoscope session={session} onForecast={() => navigate("forecast")} />
    </div>
    {stellarForecast && paidRequested && <div hidden={view !== "forecast"} className="min-h-screen min-h-[100svh]">
      {error
        ? <section className="p-8"><p role="alert">{error}</p><button onClick={() => setRetry(value => value + 1)}>再試行</button><button className="ml-5" onClick={() => navigate("horoscope")}>Horoscopeへ戻る</button></section>
        : paidReady
          ? <Suspense fallback={<p className="p-8" role="status">星の見通しを読み込んでいます…</p>}><PaidForecast onHoroscope={() => navigate("horoscope")} /></Suspense>
          : <p className="p-8" role="status">星の見通しの計算を開始しています…</p>}
    </div>}
    <footer aria-label="法務情報" className="flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-slate-200/90 bg-[#f8fafc] px-4 py-5 text-center text-xs text-[#0A192F]/70">
      <a href="/legal/terms.html">利用規約</a>
      <a href="/legal/privacy.html">プライバシーポリシー</a>
      <a href="/legal/commerce.html">特定商取引法に基づく表記</a>
      <a href="/legal/disclaimer.html">免責事項</a>
      <a href="/legal/contact.html">お問い合わせ</a>
    </footer>
  </>;
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
  useEffect(() => {
    if (session?.state !== "paid" || ["owner", "invite"].includes(session.access_source)) return;
    const remaining = Date.parse(session.valid_until) - Date.now();
    const timer = setTimeout(() => {
      const checking = { ...session, state: "checking", capabilities: {} };
      configureStorage(checking);
      setSession(checking); // remove paid UI/caches before asynchronous revalidation
      refresh();
    }, Math.min(Math.max(Number.isFinite(remaining) ? remaining : 0, 0) + 1, 2147483647));
    return () => clearTimeout(timer);
  }, [session?.state, session?.valid_until, session?.access_source]);
  if (error) return <section className="p-8"><p role="alert">{error}</p><button onClick={refresh}>再試行</button><a className="ml-5 underline" href="/login.html">ログイン画面へ</a></section>;
  if (!session) return <p className="p-8" role="status">利用状態を確認しています…</p>;
  return <AccessContext.Provider value={{ session }}><CalendarWorkspace key={session.user_id || 'anonymous'}><DeviceTimeBoundary key={`${session.user_id}:${session.state}`} refreshReading={postJson}><Workspace session={session} /></DeviceTimeBoundary></CalendarWorkspace></AccessContext.Provider>;
}

const root = import.meta.hot?.data.root || createRoot(document.getElementById("forecast-detail-root"));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<App />);
