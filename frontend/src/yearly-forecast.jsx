import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarDays, CircleDot, Target } from "lucide-react";
import { getStoredReadingResult } from "./reading-storage.js";

const WIDTH = 1200;
const HEIGHT = 380;
const PAD = { top: 52, right: 12, bottom: 46, left: 44 };
const Y_AXIS_LABEL = "運勢スコア";
const X_AXIS_LABEL = "日付";
const SERIES = [
  { key: "total", label: "総合", color: "#4F53B8" },
  { key: "general", label: "全般・健康", color: "#2F9E68" },
  { key: "work", label: "仕事", color: "#2F6FED" },
  { key: "love", label: "恋愛・対人", color: "#D84C8B" },
  { key: "money", label: "お金", color: "#D4AF37" },
];
const DETAIL_SERIES = [
  { key: "general", label: "全般・健康", color: "#2F9E68" },
  { key: "work", label: "仕事", color: "#2F6FED" },
  { key: "love", label: "恋愛・対人", color: "#D84C8B" },
  { key: "money", label: "お金", color: "#D4AF37" },
];
const RANGE_OPTIONS = [
  { months: 0.25, label: "1週間", days: 7 },
  { months: 1, label: "1ヶ月", days: 31 },
  { months: 3, label: "3ヶ月", days: 92 },
  { months: 6, label: "6ヶ月", days: 183 },
  { months: 12, label: "12ヶ月", days: 366 },
];

const PLANET_LABELS = {
  SUN: "太陽",
  MOON: "月",
  MERCURY: "水星",
  VENUS: "金星",
  MARS: "火星",
  JUPITER: "木星",
  SATURN: "土星",
  URANUS: "天王星",
  NEPTUNE: "海王星",
  PLUTO: "冥王星",
  ASC: "ASC",
  MC: "MC",
};

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function getYearlyForecast() {
  return getStoredReadingResult()?.yearly_forecast || null;
}

function isDeveloperMode() {
  try {
    return new URL(window.location.href).searchParams.get("mode") === "developer";
  } catch {
    return false;
  }
}

function scoreFor(day, key) {
  return Number(day?.scores?.[key] ?? 0);
}

function formatScore(value) {
  const score = Number(value) || 0;
  if (score > 0) return `+${score}`;
  if (score === 0) return "±0";
  return String(score);
}

function chartX(index, count) {
  if (count <= 1) return PAD.left;
  return PAD.left + (index / (count - 1)) * (WIDTH - PAD.left - PAD.right);
}

function chartY(value) {
  const clamped = Math.max(-100, Math.min(100, Number(value) || 0));
  return PAD.top + ((100 - clamped) / 200) * (HEIGHT - PAD.top - PAD.bottom);
}

function buildPath(data, key) {
  return data
    .map((day, index) => {
      const x = chartX(index, data.length);
      const y = chartY(scoreFor(day, key));
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function nearestIndexFromPointer(event, count) {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
  const ratio = (x - PAD.left) / (WIDTH - PAD.left - PAD.right);
  return Math.max(0, Math.min(count - 1, Math.round(ratio * (count - 1))));
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function toInputDate(value) {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      const [, year, month, day] = match;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nearestDateIndex(data, value) {
  const target = new Date(`${value}T00:00:00`).getTime();
  if (Number.isNaN(target)) return -1;
  let bestIndex = -1;
  let bestDistance = Infinity;
  data.forEach((day, index) => {
    const time = new Date(`${toInputDate(day.date)}T00:00:00`).getTime();
    if (Number.isNaN(time)) return;
    const distance = Math.abs(time - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function CalendarDatePicker({ value, min, max, onChange, size = 17 }) {
  const inputRef = useRef(null);
  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.click();
  };

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-md text-primary transition hover:text-secondary"
        onClick={openPicker}
        aria-label="日付を選択"
      >
        <CalendarDays size={size} />
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
        tabIndex={-1}
      />
    </span>
  );
}

function planetLabel(value) {
  const key = String(value || "").trim().toUpperCase();
  if (!key) return "";
  if (key.startsWith("SOLAR_HOUSE_")) return `ソーラーハウス${key.replace("SOLAR_HOUSE_", "")}`;
  return PLANET_LABELS[key] || value;
}

function aspectStateLabel(event) {
  const motionLabel =
    event?.is_retrograde === true || event?.retrograde === true || event?.t_retrograde === true
      ? "逆行"
      : "順行";
  const status = String(event?.orb_status || event?.scan_status || "").trim().toLowerCase();
  const phaseLabel =
    status.includes("separating") || status.includes("depart") || status.includes("turning_away")
      ? "離脱"
      : status.includes("applying") || status.includes("approach") || status.includes("closest") || status.includes("exact")
        ? "接近"
        : "";
  return [motionLabel, phaseLabel].filter(Boolean).join(" / ");
}

function aspectDisplayLabel(event) {
  const angle = event?.aspect_angle ?? event?.angle ?? event?.exact_angle;
  const transitPlanet = planetLabel(event?.t_planet || event?.transit_planet);
  const natalPlanet = planetLabel(event?.n_planet || event?.natal_planet);
  if (!transitPlanet || !natalPlanet || angle === null || angle === undefined || angle === "") {
    return "";
  }
  const numericAngle = Number(angle);
  const angleLabel = Number.isFinite(numericAngle) ? numericAngle : angle;
  const state = aspectStateLabel(event);
  return `ネイタル${natalPlanet} × トランジット${transitPlanet} ${angleLabel}°${state ? `（${state}）` : ""}`;
}

function eventForSeries(day, key, themeMode = "short") {
  const mode = themeMode === "long" ? "long" : "short";
  const durationTypesForMode = mode === "long" ? ["LONG"] : ["SHORT", "MID"];
  const themeHighlights = day?.category_theme_highlights || day?.categoryThemeHighlights || {};
  if (Object.prototype.hasOwnProperty.call(themeHighlights?.[mode] || {}, key)) {
    return themeHighlights[mode][key] || null;
  }
  const highlights = day?.category_highlights || day?.categoryHighlights || {};
  const highlightedEvent = Object.prototype.hasOwnProperty.call(highlights, key) ? highlights[key] : null;
  const events = Array.isArray(day?.events) ? day.events : [];
  const normalizedPlanet = (value) => String(value || "").trim().toUpperCase().replace(/^TRANSIT_/, "");
  const aspectEvents = [
    highlightedEvent,
    ...events,
  ].filter((event) =>
    event?.aspect_angle !== null &&
    event?.aspect_angle !== undefined &&
    normalizedPlanet(event?.t_planet || event?.transit_planet) !== "MOON" &&
    durationTypesForMode.includes(String(event?.duration_type || event?.durationType || "").trim().toUpperCase())
  );
  if (!aspectEvents.length) return null;
  const candidates =
    key === "total"
      ? aspectEvents
      : aspectEvents.filter((event) => String(event?.category || "").trim().toLowerCase() === key);
  if (!candidates.length) return null;
  return [...candidates].sort(
    (a, b) =>
      Number(b.priority || 0) - Number(a.priority || 0) ||
      Math.abs(Number(b.weighted_score || 0)) - Math.abs(Number(a.weighted_score || 0))
  )[0];
}

function selectedDayFromReadingDate(data, forecast) {
  const readingDate = forecast?.reading_date || forecast?.date || forecast?.meta?.birth_date;
  if (readingDate) {
    const index = data.findIndex((day) => day.date === readingDate);
    if (index >= 0) return index;
  }
  const today = new Date().toISOString().slice(0, 10);
  const todayIndex = data.findIndex((day) => day.date === today);
  return todayIndex >= 0 ? todayIndex : 0;
}

function visibleWindow(dataLength, selectedIndex, rangeMonths) {
  const option = RANGE_OPTIONS.find((item) => item.months === rangeMonths) || RANGE_OPTIONS[0];
  if (option.months === 12 || dataLength <= option.days) {
    return { start: 0, end: dataLength };
  }
  const half = Math.floor(option.days / 2);
  const maxStart = Math.max(0, dataLength - option.days);
  const start = Math.max(0, Math.min(maxStart, selectedIndex - half));
  return { start, end: Math.min(dataLength, start + option.days) };
}

function tickIndexes(count) {
  if (count <= 1) return [0];
  const steps = count <= 45 ? 3 : 4;
  return Array.from({ length: steps + 1 }, (_, index) =>
    Math.min(count - 1, Math.round((index / steps) * (count - 1)))
  ).filter((value, index, values) => values.indexOf(value) === index);
}

export function YearlyForecastGraph({ forecast, developerMode = false, hideHeader = false }) {
  const data = Array.isArray(forecast?.yearly_data) ? forecast.yearly_data : [];
  const milestones = Array.isArray(forecast?.milestones) ? forecast.milestones : [];
  const initialIndex = useMemo(() => (data.length ? selectedDayFromReadingDate(data, forecast) : 0), [data, forecast]);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [rangeMonths, setRangeMonths] = useState(1);
  const [detailSeries, setDetailSeries] = useState("general");
  const [themeMode, setThemeMode] = useState("short");

  if (!data.length) {
    return null;
  }

  const { start: visibleStart, end: visibleEnd } = visibleWindow(data.length, selectedIndex, rangeMonths);
  const visibleData = data.slice(visibleStart, visibleEnd);
  const visibleSelectedIndex = Math.max(0, Math.min(visibleData.length - 1, selectedIndex - visibleStart));
  const selectedDay = data[selectedIndex] || data[0];
  const selectedDateValue = toInputDate(selectedDay?.date);
  const minDateValue = toInputDate(data[0]?.date);
  const maxDateValue = toInputDate(data[data.length - 1]?.date);
  const handleDateSelect = (value) => {
    const exactIndex = data.findIndex((day) => toInputDate(day.date) === value);
    const nextIndex = exactIndex >= 0 ? exactIndex : nearestDateIndex(data, value);
    if (nextIndex >= 0) {
      setSelectedIndex(nextIndex);
    }
  };
  const detailSeriesMeta = DETAIL_SERIES.find((item) => item.key === detailSeries) || DETAIL_SERIES[0];
  const selectedEvent = eventForSeries(selectedDay, detailSeries, themeMode) || {
    title: `${detailSeriesMeta.label}：アスペクトなし`,
    description: "アスペクトなし",
    advised_task: "アスペクトなし",
  };
  const selectedAspectLabel = aspectDisplayLabel(selectedEvent);
  const zeroY = chartY(0);

  return (
    <section className={cx(
      "bg-white px-0 shadow-[0_18px_36px_rgba(46,52,45,0.08)]",
      hideHeader ? "min-h-full rounded-none border-0 py-0" : "rounded-[28px] border border-outline-variant/30 py-3 md:p-4"
    )}>
      <div className={hideHeader ? "hidden" : "mb-4 flex flex-col gap-2 px-3 md:mb-5 md:flex-row md:items-end md:justify-between md:gap-3 md:px-0"}>
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.3em] text-secondary md:mb-2">Yearly Forecast</p>
          <h2 className="font-notoSerif text-2xl text-primary md:text-3xl">2026 運勢シミュレーション</h2>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-on-surface-variant md:mt-2">{forecast.summary}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant/25 bg-[#fffdf8]">
        <div className="flex flex-col items-start gap-2 px-3 pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:pt-4">
          <div className="grid grid-cols-5 gap-1 rounded-full border border-outline-variant/30 bg-white/85 p-1 text-xs text-on-surface-variant shadow-sm">
            {RANGE_OPTIONS.map((item) => (
              <button
                key={item.months}
                type="button"
                className={cx(
                  "rounded-full px-2 py-2 font-bold transition-colors sm:px-4",
                  rangeMonths === item.months ? "bg-[#fbf5df] text-primary shadow-sm" : "hover:bg-[#fbf5df]/70"
                )}
                onClick={() => setRangeMonths(item.months)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="hidden grid-cols-5 gap-1 rounded-full border border-outline-variant/30 bg-white/85 p-1 text-xs text-on-surface-variant shadow-sm md:grid">
            {SERIES.map((item) => (
              <span key={item.key} className="inline-flex items-center justify-center gap-2 rounded-full px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
          <div className="relative w-full rounded-2xl border border-outline-variant/30 bg-white/90 p-3 text-on-surface-variant shadow-sm md:hidden">
            <div className="absolute right-4 top-3 flex items-center gap-2">
              <span className="text-[10px] font-black text-on-surface-variant">総合スコア</span>
              <span className="text-2xl font-black leading-none text-[#4F53B8]">
                {formatScore(scoreFor(selectedDay, "total"))}
              </span>
            </div>
            <div className="mb-3 flex items-center gap-2 pr-28 text-primary">
              <CalendarDatePicker
                value={selectedDateValue}
                min={minDateValue}
                max={maxDateValue}
                onChange={handleDateSelect}
                size={15}
              />
              <p className="text-xs font-bold">{selectedDay.date}</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {DETAIL_SERIES.map((item) => (
                <div key={item.key} className="min-w-0 rounded-xl bg-[#fbf5df] px-2 py-1.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="truncate text-[10px] font-bold">{item.label}</span>
                  </div>
                  <p className="mt-0.5 text-base font-black leading-none" style={{ color: item.color }}>
                    {formatScore(scoreFor(selectedDay, item.key))}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <svg
          className="block h-[190px] w-full cursor-crosshair sm:h-[340px] md:h-[430px]"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="2026 yearly forecast line chart"
          onClick={(event) => setSelectedIndex(visibleStart + nearestIndexFromPointer(event, visibleData.length))}
        >
          <rect x={PAD.left} y={PAD.top} width={WIDTH - PAD.left - PAD.right} height={zeroY - PAD.top} fill="#e8f5ed" opacity="0.78" />
          <rect x={PAD.left} y={zeroY} width={WIDTH - PAD.left - PAD.right} height={HEIGHT - PAD.bottom - zeroY} fill="#fdeceb" opacity="0.78" />
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={zeroY} y2={zeroY} stroke="#d7d9d2" />
          {[-100, -50, 0, 50, 100].map((tick) => (
            <text key={tick} x={PAD.left - 10} y={chartY(tick) + 5} textAnchor="end" fontSize="17" fontWeight="700" fill="#687066">
              {tick}
            </text>
          ))}
          {tickIndexes(visibleData.length).map((index) => (
            <g key={index}>
              <text x={chartX(index, visibleData.length)} y={HEIGHT - 31} textAnchor="middle" fontSize="17" fontWeight="700" fill="#687066">
                {formatDate(visibleData[index]?.date)}
              </text>
            </g>
          ))}
          {SERIES.map((item) => (
            <path
              key={item.key}
              d={buildPath(visibleData, item.key)}
              fill="none"
              stroke={item.color}
              strokeWidth={item.key === "total" ? 3.4 : 2.2}
              strokeDasharray={item.key === "total" ? "10 8" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={item.key === "total" ? 1 : 0.82}
            />
          ))}
          <line x1={chartX(visibleSelectedIndex, visibleData.length)} x2={chartX(visibleSelectedIndex, visibleData.length)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="#0A192F" strokeWidth="1.5" />
          <circle cx={chartX(visibleSelectedIndex, visibleData.length)} cy={chartY(scoreFor(selectedDay, "total"))} r="7" fill="#4F53B8" />
        </svg>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:mt-5 md:gap-4 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="relative hidden rounded-2xl border border-outline-variant/30 bg-surface-container-low px-5 py-4 md:block">
          <div className="absolute right-5 top-4 flex items-center gap-2">
            <span className="text-[10px] font-black text-on-surface-variant">総合スコア</span>
            <span className="text-2xl font-black leading-none text-[#4F53B8]">
              {formatScore(scoreFor(selectedDay, "total"))}
            </span>
          </div>
          <div className="mb-3 flex items-center gap-2 pr-32 text-primary">
            <CalendarDatePicker
              value={selectedDateValue}
              min={minDateValue}
              max={maxDateValue}
              onChange={handleDateSelect}
              size={17}
            />
            <p className="text-sm font-bold">{selectedDay.date}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {DETAIL_SERIES.map((item) => (
              <div key={item.key} className="rounded-xl bg-white px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">{item.label}</p>
                <p className="mt-1 text-xl font-bold" style={{ color: item.color }}>
                  {formatScore(scoreFor(selectedDay, item.key))}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative rounded-2xl border border-outline-variant/30 bg-white px-5 py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="grid grid-cols-2 gap-1 rounded-full border border-outline-variant/30 bg-white/85 p-1 text-[11px] text-on-surface-variant shadow-sm">
              {[
                ["short", "短期テーマ"],
                ["long", "長期テーマ"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={cx(
                    "whitespace-nowrap rounded-full px-2.5 py-1.5 font-bold transition-colors",
                    themeMode === value ? "bg-[#fbf5df] text-primary shadow-sm" : "hover:bg-[#fbf5df]/70"
                  )}
                  onClick={() => setThemeMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-0.5 rounded-full border border-outline-variant/30 bg-white/85 p-1 text-[10px] text-on-surface-variant shadow-sm sm:gap-1 sm:text-[11px]">
              {DETAIL_SERIES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={cx(
                    "inline-flex min-w-0 items-center justify-center gap-1 rounded-full px-1.5 py-1.5 font-bold transition-colors sm:gap-1.5 sm:px-2.5",
                    detailSeries === item.key ? "bg-[#fbf5df] text-primary shadow-sm" : "hover:bg-[#fbf5df]/70"
                  )}
                  onClick={() => setDetailSeries(item.key)}
                  title={`${item.label}の最強アスペクトを表示`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="mb-3 flex items-center gap-2 text-primary">
            <Target size={17} />
            <p className="truncate text-sm font-bold">{selectedEvent?.title || "穏やかな調整日"}</p>
          </div>
          {developerMode && selectedAspectLabel ? (
            <p className="mb-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-xs font-bold leading-5 text-primary">
              {selectedAspectLabel}
            </p>
          ) : null}
          <p className="text-sm leading-6 text-on-surface-variant">
            {selectedEvent?.description || "----"}
          </p>
          <div className="mt-4 rounded-xl bg-[#fffaf0] px-4 py-3">
            <div className="mb-1 flex items-center gap-2 text-secondary">
              <CircleDot size={15} />
              <p className="text-xs font-bold uppercase tracking-[0.18em]">Advised Task</p>
            </div>
            <p className="text-sm leading-6 text-on-surface">
              {selectedEvent?.advised_task || "----"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const mountNode = document.getElementById("yearly-forecast");
if (mountNode) {
  createRoot(mountNode).render(
    <React.StrictMode>
      <YearlyForecastGraph forecast={getYearlyForecast()} developerMode={isDeveloperMode()} />
    </React.StrictMode>
  );
}
