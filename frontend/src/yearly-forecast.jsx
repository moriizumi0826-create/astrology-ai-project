import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarDays, CircleDot, Target } from "lucide-react";
import { getStoredReadingResult } from "./reading-storage.js";

const WIDTH = 1200;
const HEIGHT = 380;
const PAD = { top: 52, right: 12, bottom: 46, left: 44 };
const CHART_TITLE = "運勢スコア推移";
const Y_AXIS_LABEL = "運勢スコア";
const X_AXIS_LABEL = "日付";
const SERIES = [
  { key: "total", label: "総合", color: "#D4AF37" },
  { key: "work", label: "仕事", color: "#2F6FED" },
  { key: "love", label: "恋愛", color: "#D84C8B" },
  { key: "money", label: "金運", color: "#2F9E68" },
];
const DETAIL_SERIES = [
  { key: "general", label: "一般", color: "#D4AF37" },
  { key: "work", label: "仕事", color: "#2F6FED" },
  { key: "love", label: "恋愛", color: "#D84C8B" },
  { key: "money", label: "金運", color: "#2F9E68" },
];
const RANGE_OPTIONS = [
  { months: 1, label: "1ヶ月", days: 31 },
  { months: 3, label: "3ヶ月", days: 92 },
  { months: 6, label: "6ヶ月", days: 183 },
  { months: 12, label: "12ヶ月", days: 366 },
];

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function getYearlyForecast() {
  return getStoredReadingResult()?.yearly_forecast || null;
}

function scoreFor(day, key) {
  return Number(day?.scores?.[key] ?? 0);
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

function eventForSeries(day, key) {
  const highlights = day?.category_highlights || day?.categoryHighlights || {};
  if (Object.prototype.hasOwnProperty.call(highlights, key)) {
    return highlights[key] || null;
  }
  const events = Array.isArray(day?.events) ? day.events : [];
  const aspectEvents = events.filter((event) => event?.aspect_angle !== null && event?.aspect_angle !== undefined);
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

function YearlyForecastGraph({ forecast }) {
  const data = Array.isArray(forecast?.yearly_data) ? forecast.yearly_data : [];
  const milestones = Array.isArray(forecast?.milestones) ? forecast.milestones : [];
  const initialIndex = useMemo(() => (data.length ? selectedDayFromReadingDate(data, forecast) : 0), [data, forecast]);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [rangeMonths, setRangeMonths] = useState(1);
  const [detailSeries, setDetailSeries] = useState("general");

  if (!data.length) {
    return null;
  }

  const { start: visibleStart, end: visibleEnd } = visibleWindow(data.length, selectedIndex, rangeMonths);
  const visibleData = data.slice(visibleStart, visibleEnd);
  const visibleSelectedIndex = Math.max(0, Math.min(visibleData.length - 1, selectedIndex - visibleStart));
  const selectedDay = data[selectedIndex] || data[0];
  const detailSeriesMeta = DETAIL_SERIES.find((item) => item.key === detailSeries) || DETAIL_SERIES[0];
  const selectedEvent = eventForSeries(selectedDay, detailSeries) || {
    title: `${detailSeriesMeta.label}：アスペクトなし`,
    description: "アスペクトなし",
    advised_task: "アスペクトなし",
  };
  const zeroY = chartY(0);

  return (
    <section className="rounded-[28px] border border-outline-variant/30 bg-white px-0 py-3 shadow-[0_18px_36px_rgba(46,52,45,0.08)] md:p-4">
      <div className="mb-4 flex flex-col gap-2 px-3 md:mb-5 md:flex-row md:items-end md:justify-between md:gap-3 md:px-0">
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.3em] text-secondary md:mb-2">Yearly Forecast</p>
          <h2 className="font-notoSerif text-2xl text-primary md:text-3xl">2026 運勢シミュレーション</h2>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-on-surface-variant md:mt-2">{forecast.summary}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant/25 bg-[#fffdf8]">
        <div className="flex flex-col items-start gap-2 px-3 pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:pt-4">
          <div className="grid grid-cols-4 gap-1 rounded-full border border-outline-variant/30 bg-white/85 p-1 text-xs text-on-surface-variant shadow-sm">
            {RANGE_OPTIONS.map((item) => (
              <button
                key={item.months}
                type="button"
                className={cx(
                  "rounded-full px-4 py-2 font-bold transition-colors",
                  rangeMonths === item.months ? "bg-[#fbf5df] text-primary shadow-sm" : "hover:bg-[#fbf5df]/70"
                )}
                onClick={() => setRangeMonths(item.months)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="hidden grid-cols-4 gap-1 rounded-full border border-outline-variant/30 bg-white/85 p-1 text-xs text-on-surface-variant shadow-sm md:grid">
            {SERIES.map((item) => (
              <span key={item.key} className="inline-flex items-center justify-center gap-2 rounded-full px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
          <div className="w-full rounded-2xl border border-outline-variant/30 bg-white/90 p-3 text-on-surface-variant shadow-sm md:hidden">
            <div className="mb-2 flex items-center gap-2 text-primary">
              <CalendarDays size={15} />
              <p className="text-xs font-bold">{selectedDay.date}</p>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {SERIES.map((item) => (
                <div key={item.key} className="min-w-0 rounded-xl bg-[#fffdf8] px-2 py-2 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="truncate text-[11px] font-bold">{item.label}</span>
                  </div>
                  <p className="mt-1 text-lg font-black leading-none" style={{ color: item.color }}>
                    {scoreFor(selectedDay, item.key)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <svg
          className="block h-[285px] w-full cursor-crosshair sm:h-[340px] md:h-[430px]"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="2026 yearly forecast line chart"
          onClick={(event) => setSelectedIndex(visibleStart + nearestIndexFromPointer(event, visibleData.length))}
        >
          <text x={WIDTH / 2} y="34" textAnchor="middle" fontSize="28" fontWeight="900" fill="#0A192F">
            {CHART_TITLE}
          </text>
          <text
            x="18"
            y={(PAD.top + HEIGHT - PAD.bottom) / 2}
            textAnchor="middle"
            fontSize="19"
            fontWeight="800"
            fill="#687066"
            transform={`rotate(-90 18 ${(PAD.top + HEIGHT - PAD.bottom) / 2})`}
          >
            {Y_AXIS_LABEL}
          </text>
          <text x={(PAD.left + WIDTH - PAD.right) / 2} y={HEIGHT - 12} textAnchor="middle" fontSize="19" fontWeight="800" fill="#687066">
            {X_AXIS_LABEL}
          </text>
          <rect x={PAD.left} y={PAD.top} width={WIDTH - PAD.left - PAD.right} height={zeroY - PAD.top} fill="#e8f5ed" opacity="0.78" />
          <rect x={PAD.left} y={zeroY} width={WIDTH - PAD.left - PAD.right} height={HEIGHT - PAD.bottom - zeroY} fill="#fdeceb" opacity="0.78" />
          {[-100, -50, 0, 50, 100].map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={chartY(tick)} y2={chartY(tick)} stroke="#d7d9d2" strokeDasharray={tick === 0 ? "0" : "5 7"} />
              <text x={PAD.left - 10} y={chartY(tick) + 5} textAnchor="end" fontSize="17" fontWeight="700" fill="#687066">
                {tick}
              </text>
            </g>
          ))}
          {tickIndexes(visibleData.length).map((index) => (
            <g key={index}>
              <line x1={chartX(index, visibleData.length)} x2={chartX(index, visibleData.length)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="#e5e2d8" />
              <text x={chartX(index, visibleData.length)} y={HEIGHT - 31} textAnchor="middle" fontSize="17" fontWeight="700" fill="#687066">
                {formatDate(visibleData[index]?.date)}
              </text>
            </g>
          ))}
          {SERIES.map((item) => (
            <path key={item.key} d={buildPath(visibleData, item.key)} fill="none" stroke={item.color} strokeWidth={item.key === "total" ? 3.2 : 2.2} strokeLinecap="round" strokeLinejoin="round" opacity={item.key === "total" ? 1 : 0.82} />
          ))}
          <line x1={chartX(visibleSelectedIndex, visibleData.length)} x2={chartX(visibleSelectedIndex, visibleData.length)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="#0A192F" strokeWidth="1.5" />
          <circle cx={chartX(visibleSelectedIndex, visibleData.length)} cy={chartY(scoreFor(selectedDay, "total"))} r="7" fill="#0A192F" />
        </svg>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:mt-5 md:gap-4 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="hidden rounded-2xl border border-outline-variant/30 bg-surface-container-low px-5 py-4 md:block">
          <div className="mb-3 flex items-center gap-2 text-primary">
            <CalendarDays size={17} />
            <p className="text-sm font-bold">{selectedDay.date}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {SERIES.map((item) => (
              <div key={item.key} className="rounded-xl bg-white px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-on-surface-variant">{item.label}</p>
                <p className="mt-1 text-xl font-bold" style={{ color: item.color }}>
                  {scoreFor(selectedDay, item.key)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative rounded-2xl border border-outline-variant/30 bg-white px-5 py-4 pt-16 sm:pt-4">
          <div className="mb-3 flex items-center gap-2 pr-0 text-primary sm:pr-72">
            <Target size={17} />
            <p className="truncate text-sm font-bold">{selectedEvent?.title || "穏やかな調整日"}</p>
          </div>
          <div className="absolute right-5 top-4">
            <div className="grid grid-cols-4 gap-1 rounded-full border border-outline-variant/30 bg-white/85 p-1 text-[11px] text-on-surface-variant shadow-sm">
              {DETAIL_SERIES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={cx(
                    "inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 font-bold transition-colors",
                    detailSeries === item.key ? "bg-[#fbf5df] text-primary shadow-sm" : "hover:bg-[#fbf5df]/70"
                  )}
                  onClick={() => setDetailSeries(item.key)}
                  title={`${item.label}の最強アスペクトを表示`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
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
      <YearlyForecastGraph forecast={getYearlyForecast()} />
    </React.StrictMode>
  );
}
