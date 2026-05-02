import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarDays, CircleDot, Target } from "lucide-react";

const RESULT_STORAGE_KEY = "celestial-atelier:last-reading-result";
const WIDTH = 960;
const HEIGHT = 340;
const PAD = { top: 72, right: 28, bottom: 42, left: 46 };
const SERIES = [
  { key: "total", label: "総合", color: "#D4AF37" },
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
  try {
    const raw = window.sessionStorage.getItem(RESULT_STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    return payload?.yearly_forecast || null;
  } catch {
    return null;
  }
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

function strongestEvent(day) {
  const events = Array.isArray(day?.events) ? day.events : [];
  if (!events.length) return null;
  return [...events].sort(
    (a, b) =>
      Number(b.priority || 0) - Number(a.priority || 0) ||
      Math.abs(Number(b.weighted_score || 0)) - Math.abs(Number(a.weighted_score || 0))
  )[0];
}

function selectedDayFromMilestones(data, milestones) {
  const firstMilestone = Array.isArray(milestones) ? milestones[0] : null;
  if (firstMilestone?.date) {
    const index = data.findIndex((day) => day.date === firstMilestone.date);
    if (index >= 0) return index;
  }
  return data.reduce((bestIndex, day, index) => {
    return scoreFor(day, "total") > scoreFor(data[bestIndex], "total") ? index : bestIndex;
  }, 0);
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
  const initialIndex = useMemo(() => (data.length ? selectedDayFromMilestones(data, milestones) : 0), [data, milestones]);
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  const [rangeMonths, setRangeMonths] = useState(1);

  if (!data.length) {
    return null;
  }

  const { start: visibleStart, end: visibleEnd } = visibleWindow(data.length, selectedIndex, rangeMonths);
  const visibleData = data.slice(visibleStart, visibleEnd);
  const visibleSelectedIndex = Math.max(0, Math.min(visibleData.length - 1, selectedIndex - visibleStart));
  const selectedDay = data[selectedIndex] || data[0];
  const selectedEvent = strongestEvent(selectedDay);
  const milestoneDates = new Set(milestones.map((item) => item.date));
  const zeroY = chartY(0);

  return (
    <section className="rounded-[28px] border border-outline-variant/30 bg-white p-5 shadow-[0_18px_36px_rgba(46,52,45,0.08)] md:p-7">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.3em] text-secondary">Yearly Forecast</p>
          <h2 className="font-notoSerif text-2xl text-primary md:text-3xl">2026 運勢シミュレーション</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-on-surface-variant">{forecast.summary}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant/25 bg-[#fffdf8]">
        <div className="flex flex-col items-start gap-2 px-4 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
          <div className="grid grid-cols-4 gap-1 rounded-full border border-outline-variant/30 bg-white/85 p-1 text-xs text-on-surface-variant shadow-sm">
            {SERIES.map((item) => (
              <span key={item.key} className="inline-flex items-center justify-center gap-2 rounded-full px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
        <svg
          className="block h-[300px] w-full cursor-crosshair md:h-[390px]"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label="2026 yearly forecast line chart"
          onClick={(event) => setSelectedIndex(visibleStart + nearestIndexFromPointer(event, visibleData.length))}
        >
          <rect x={PAD.left} y={PAD.top} width={WIDTH - PAD.left - PAD.right} height={zeroY - PAD.top} fill="#e8f5ed" opacity="0.78" />
          <rect x={PAD.left} y={zeroY} width={WIDTH - PAD.left - PAD.right} height={HEIGHT - PAD.bottom - zeroY} fill="#fdeceb" opacity="0.78" />
          {[-100, -50, 0, 50, 100].map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={chartY(tick)} y2={chartY(tick)} stroke="#d7d9d2" strokeDasharray={tick === 0 ? "0" : "5 7"} />
              <text x={PAD.left - 10} y={chartY(tick) + 4} textAnchor="end" fontSize="12" fill="#687066">
                {tick}
              </text>
            </g>
          ))}
          {tickIndexes(visibleData.length).map((index) => (
            <g key={index}>
              <line x1={chartX(index, visibleData.length)} x2={chartX(index, visibleData.length)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="#e5e2d8" />
              <text x={chartX(index, visibleData.length)} y={HEIGHT - 16} textAnchor="middle" fontSize="12" fill="#687066">
                {formatDate(visibleData[index]?.date)}
              </text>
            </g>
          ))}
          {SERIES.map((item) => (
            <path key={item.key} d={buildPath(visibleData, item.key)} fill="none" stroke={item.color} strokeWidth={item.key === "total" ? 3.2 : 2.2} strokeLinecap="round" strokeLinejoin="round" opacity={item.key === "total" ? 1 : 0.82} />
          ))}
          {visibleData.map((day, index) => {
            if (!milestoneDates.has(day.date)) return null;
            return (
              <circle
                key={day.date}
                cx={chartX(index, visibleData.length)}
                cy={chartY(scoreFor(day, "total"))}
                r={4.5}
                fill="#ffffff"
                stroke="#0A192F"
                strokeWidth="2"
              />
            );
          })}
          <line x1={chartX(visibleSelectedIndex, visibleData.length)} x2={chartX(visibleSelectedIndex, visibleData.length)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke="#0A192F" strokeWidth="1.5" />
          <circle cx={chartX(visibleSelectedIndex, visibleData.length)} cy={chartY(scoreFor(selectedDay, "total"))} r="7" fill="#0A192F" />
        </svg>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-low px-5 py-4">
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

        <div className="rounded-2xl border border-outline-variant/30 bg-white px-5 py-4">
          <div className="mb-3 flex items-center gap-2 text-primary">
            <Target size={17} />
            <p className="text-sm font-bold">{selectedEvent?.title || "穏やかな調整日"}</p>
          </div>
          <p className="text-sm leading-6 text-on-surface-variant">
            {selectedEvent?.description || "大きなイベントは少ない日です。基礎リズムを整えるほど流れが安定します。"}
          </p>
          <div className="mt-4 rounded-xl bg-[#fffaf0] px-4 py-3">
            <div className="mb-1 flex items-center gap-2 text-secondary">
              <CircleDot size={15} />
              <p className="text-xs font-bold uppercase tracking-[0.18em]">Advised Task</p>
            </div>
            <p className="text-sm leading-6 text-on-surface">
              {selectedEvent?.advised_task || "今日やることを一つに絞り、余白を残して進める。"}
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
