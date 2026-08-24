import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { LockKeyhole, Menu, X } from "lucide-react";
import { BirthDataEditor } from "./birth-data-editor.jsx";
import { FreeHoroscopeContent } from "./free-horoscope-content.jsx";
import { Horoscope3DMap } from "./horoscope-3d-map.jsx";
import {
  currentTokyoDate,
  getStoredReadingForm,
  getStoredReadingResult,
  getStoredReadingResultAsync,
  storeReadingForm,
  storeReadingResult,
} from "./reading-storage.js";
import { readableErrorMessage } from "./error-message.mjs";
import forecastGalaxyBg from "./assets/daily-detail-galaxy-bg.jpg";

const APP_BRAND = "The Celestial Atelier テストversion";
const ENTRY_PAGE_PATH = "./index-v2.html";

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function resolveApiBaseUrl() {
  const configured = String(typeof __APP_API_BASE_URL__ === "undefined" ? "" : __APP_API_BASE_URL__ || "").trim();
  if (configured) return configured.replace(/\/$/, "");
  try {
    const params = new URL(window.location.href).searchParams;
    const requested = String(params.get("api_base") || "").trim();
    if (requested) {
      window.localStorage?.setItem("celestial_api_base_url", requested);
      return requested.replace(/\/$/, "");
    }
    const stored = String(window.localStorage?.getItem("celestial_api_base_url") || "").trim();
    if (stored) return stored.replace(/\/$/, "");
  } catch {
    // Use the default endpoint when a local override is unavailable.
  }
  if (["localhost", "127.0.0.1"].includes(window.location.hostname) && /^517\d$/.test(window.location.port)) {
    return "http://127.0.0.1:8000";
  }
  return window.location.origin.replace(/\/$/, "");
}

function formatApiError(detail, fallback) {
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      if (typeof item === "string") return item;
      const location = Array.isArray(item?.loc) ? item.loc.join(".") : "";
      const message = item?.msg || JSON.stringify(item);
      return location ? `${location}: ${message}` : message;
    }).join(" / ");
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return fallback;
  }
}

async function responseJson(response) {
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json")
    ? response.json().catch(() => ({}))
    : { detail: await response.text().catch(() => "") };
}

async function getJson(path) {
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const data = await responseJson(response);
  if (!response.ok) throw new Error(formatApiError(data.detail, `Request failed: ${response.status}`));
  return data;
}

async function postJson(path, payload) {
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await responseJson(response);
  if (!response.ok) throw new Error(formatApiError(data.detail, `Request failed: ${response.status}`));
  return data;
}

function getQueryReadingForm() {
  try {
    const params = new URL(window.location.href).searchParams;
    const birthDate = params.get("birth_date");
    const birthTime = params.get("birth_time");
    const latitude = Number(params.get("latitude"));
    const longitude = Number(params.get("longitude"));
    if (!birthDate || !birthTime || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      full_name: params.get("full_name") || "Test User",
      birth_date: birthDate,
      birth_time: birthTime,
      birth_time_unknown: false,
      birthplace: params.get("birthplace") || "指定地点",
      latitude,
      longitude,
      timezone_offset: Number(params.get("timezone_offset") || 9),
      timezone_name: params.get("timezone_name") || "Asia/Tokyo",
    };
  } catch {
    return null;
  }
}

function clearQueryReadingForm() {
  try {
    const url = new URL(window.location.href);
    [
      "full_name",
      "birth_date",
      "birth_time",
      "birthplace",
      "latitude",
      "longitude",
      "timezone_offset",
      "timezone_name",
    ].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, "", url.toString());
  } catch {
    // Query cleanup is optional.
  }
}

export function selectFreeHoroscopePayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const dashboard = source.dashboard_data || source.dashboardData || {};
  const meta = source.meta && typeof source.meta === "object" ? source.meta : {};
  const chartData = source.chart_data || source.chartData || null;
  return {
    readings: Array.isArray(source.readings) ? source.readings : [],
    meta,
    ...(chartData && typeof chartData === "object" ? { chart_data: chartData } : {}),
    natal_points: Array.isArray(dashboard.natal_points) ? dashboard.natal_points : [],
    natal_house_cusps: Array.isArray(dashboard.natal_house_cusps) ? dashboard.natal_house_cusps : [],
    reading_date: dashboard.reading_date || dashboard.readingDate || meta.reading_date || currentTokyoDate(),
  };
}

function FreeHeader({ onLockedView }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="fixed left-0 top-0 z-40 w-full border-b border-slate-200/90 bg-[#f8fafc]/95 backdrop-blur-xl">
      <div className="flex w-full max-w-none flex-wrap items-center justify-between gap-2 px-3 py-2 sm:gap-6 sm:px-8 sm:py-6 lg:mx-auto lg:max-w-[1760px]">
        <a href={ENTRY_PAGE_PATH} className="max-w-[88px] font-serif text-[11px] font-bold leading-[0.98] text-[#0A192F] sm:max-w-none sm:text-4xl sm:leading-none">
          {APP_BRAND}
        </a>
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0A192F] shadow-sm transition hover:bg-[#fff7df] hover:text-[#D4AF37] sm:hidden"
          aria-expanded={menuOpen}
          aria-controls="free-horoscope-nav"
          aria-label="ナビゲーションを開く"
        >
          <Menu size={16} />
        </button>
        <nav
          id="free-horoscope-nav"
          className={cx(
            "w-full items-center gap-6 border-t border-slate-200 pt-3 font-mono text-[10px] font-bold tracking-[0.1em] text-[#0A192F]/70 sm:flex sm:w-auto sm:border-0 sm:pt-0 sm:text-xs",
            menuOpen ? "flex" : "hidden"
          )}
        >
          <button
            type="button"
            onClick={onLockedView}
            className="inline-flex items-center gap-1 pb-2 text-[#0A192F]/45 transition hover:text-[#9d7620] sm:pb-0"
            aria-label="星の見通し（有料版限定）"
          >
            星の見通し <LockKeyhole size={11} aria-hidden="true" />
          </button>
          <span className="border-b-2 border-[#D4AF37] pb-2 text-[#0A192F] sm:pb-1">Horoscope</span>
        </nav>
      </div>
    </header>
  );
}

function LockedViewDialog({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#08111f]/75 px-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="locked-view-title"
        className="w-full max-w-[440px] rounded-2xl border border-[#D4AF37]/40 bg-[#fffdf7] p-6 text-[#0A192F] shadow-[0_24px_90px_rgba(0,0,0,0.42)] sm:p-8"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#D4AF37]/15 text-[#9d7620]">
            <LockKeyhole size={20} aria-hidden="true" />
          </span>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-[#0A192F]/55 transition hover:bg-black/5" aria-label="閉じる">
            <X size={18} />
          </button>
        </div>
        <p className="mt-5 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[#9d7620]">Locked</p>
        <h2 id="locked-view-title" className="mt-2 font-serif text-2xl font-semibold sm:text-3xl">星の見通しは有料版限定です</h2>
        <p className="mt-5 text-sm leading-7 text-[#0A192F]/70">無料版ではHoroscopeのみご利用いただけます。</p>
      </div>
    </div>
  );
}

function GalaxyBackground({ children }) {
  return (
    <section
      className="relative min-h-[calc(100vh-112px)] overflow-hidden bg-[#05070f]"
      style={{
        backgroundImage: `linear-gradient(180deg, rgba(5,7,15,0.28), rgba(5,7,15,0.52)), url(${forecastGalaxyBg})`,
        backgroundAttachment: "fixed",
        backgroundPosition: "center center",
        backgroundSize: "cover",
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(233,195,73,0.16),transparent_32%),linear-gradient(90deg,rgba(5,7,15,0.14),rgba(5,7,15,0.02)_42%,rgba(5,7,15,0.24))]" />
      <div className="relative z-10">{children}</div>
    </section>
  );
}

function FreeHoroscopePage() {
  const initialStoredPayload = useMemo(() => getStoredReadingResult({ allowStale: true }) || {}, []);
  const [data, setData] = useState(() => ({ ...selectFreeHoroscopePayload(initialStoredPayload), is_loading: true }));
  const [lockedViewOpen, setLockedViewOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getStoredReadingResultAsync({ allowStale: true })
      .then((payload) => {
        if (active) setData(selectFreeHoroscopePayload(payload || initialStoredPayload));
      })
      .catch(() => {
        if (active) setData(selectFreeHoroscopePayload(initialStoredPayload));
      });
    return () => {
      active = false;
    };
  }, [initialStoredPayload]);

  const searchBirthLocations = useCallback((values) => {
    const params = new URLSearchParams({
      q: values.q,
      prefecture: values.prefecture,
      birth_time_unknown: String(Boolean(values.birth_time_unknown)),
      limit: "5",
    });
    if (values.birth_date) params.set("birth_date", values.birth_date);
    if (values.birth_time && !values.birth_time_unknown) params.set("birth_time", values.birth_time);
    return getJson(`/api/location-search?${params.toString()}`);
  }, []);

  const handleBirthDataRecalculate = useCallback(async ({ request, snapshot }) => {
    setError("");
    try {
      const nextReading = await postJson("/api/readings?defer_widgets=true", request);
      const freePayload = selectFreeHoroscopePayload(nextReading);
      clearQueryReadingForm();
      storeReadingForm(snapshot);
      await storeReadingResult({
        readings: freePayload.readings,
        meta: freePayload.meta,
        ...(freePayload.chart_data ? { chart_data: freePayload.chart_data } : {}),
        dashboard_data: {
          natal_points: freePayload.natal_points,
          natal_house_cusps: freePayload.natal_house_cusps,
          reading_date: freePayload.reading_date,
        },
      });
      setData(freePayload);
    } catch (requestError) {
      const message = readableErrorMessage(requestError, "ホロスコープの再計算に失敗しました。");
      setError(message);
      throw new Error(message);
    }
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden text-starlight">
      <FreeHeader onLockedView={() => setLockedViewOpen(true)} />
      <main className="pt-[57px] sm:pt-[89px]">
        <GalaxyBackground>
          {error ? (
            <div className="mx-auto max-w-[1440px] px-5 pt-5 md:px-8 lg:px-14">
              <div className="rounded-2xl border border-[#ffb4ab]/30 bg-[#3a1d1d]/70 px-4 py-3 text-xs leading-6 text-[#ffb4ab] sm:text-sm" role="alert">
                {error}
              </div>
            </div>
          ) : null}
          <FreeHoroscopeContent
            data={data}
            belowMetaContent={(
              <>
                <BirthDataEditor
                  initialForm={getStoredReadingForm() || getQueryReadingForm() || {}}
                  meta={data.meta || {}}
                  onSearchLocations={searchBirthLocations}
                  onRecalculate={handleBirthDataRecalculate}
                />
                <Horoscope3DMap data={data} />
              </>
            )}
          />
        </GalaxyBackground>
      </main>
      <footer className="border-t border-slate-200/90 bg-[#f8fafc]/95 px-4 py-8 text-[#0A192F] sm:px-8 sm:py-10">
        <div className="mx-auto flex max-w-[1540px] flex-col gap-4 text-[#0A192F]/70 md:flex-row md:items-center md:justify-between">
          <p className="font-serif text-2xl font-semibold text-[#0A192F]">{APP_BRAND}</p>
          <a href={ENTRY_PAGE_PATH} className="font-mono text-xs uppercase tracking-[0.18em] text-[#0A192F]/70 hover:text-[#D4AF37]">Back to Entry</a>
        </div>
      </footer>
      <LockedViewDialog open={lockedViewOpen} onClose={() => setLockedViewOpen(false)} />
    </div>
  );
}

createRoot(document.getElementById("forecast-detail-root")).render(
  <React.StrictMode>
    <FreeHoroscopePage />
  </React.StrictMode>
);
