import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Bell, CircleDot, Shield, Sparkles, Star } from "lucide-react";
import { getStoredReadingResult } from "./reading-storage.js";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const SCORE_KEYS = [
  { key: "general", label: "全般・健康", color: "#e9c349" },
  { key: "work", label: "仕事", color: "#d3bcf9" },
  { key: "love", label: "恋愛・対人", color: "#ffb4ab" },
  { key: "money", label: "お金", color: "#c3c6d7" },
];
const CHART = { width: 920, height: 360, left: 34, right: 18, top: 34, bottom: 42 };

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function getForecast() {
  const payload = getStoredReadingResult();
  return payload?.yearly_forecast || payload?.yearlyForecast || null;
}

function demoForecast() {
  const monthScores = {
    general: [45, 12, 88, 34, -15, 62, 41, 94, 20, -30, 5, 18],
    work: [22, -8, 56, 78, 44, -21, 89, 67, 32, 12, -10, 55],
    love: [-12, 34, 92, 45, 12, 56, 22, 98, -5, -40, 63, 77],
    money: [30, 45, -18, 12, 88, 56, -5, 33, 91, 22, 45, -22],
  };
  const yearly_data = Array.from({ length: 12 }, (_, index) => ({
    date: `2026-${String(index + 1).padStart(2, "0")}-15`,
    scores: {
      total: Math.round(
        (monthScores.general[index] + monthScores.work[index] + monthScores.love[index] + monthScores.money[index]) / 4
      ),
      general: monthScores.general[index],
      work: monthScores.work[index],
      love: monthScores.love[index],
      money: monthScores.money[index],
    },
    text_description: "年間の流れを確認し、強まるテーマに合わせて行動の優先順位を整えます。",
  }));
  return {
    summary: "2026年の運勢推移を、主要カテゴリごとのスコア変化として可視化します。",
    reading_date: "2026-05-20",
    yearly_data,
    milestones: [
      { date: "2026-03-15", title: "成長テーマの加速", score: 88 },
      { date: "2026-08-15", title: "年間ピーク", score: 94 },
      { date: "2026-10-15", title: "見直しの谷", score: -30 },
    ],
  };
}

function scoreFor(day, key) {
  return Number(day?.scores?.[key] ?? 0);
}

function formatScore(value) {
  const score = Math.round(Number(value) || 0);
  if (score > 0) return `+${score}`;
  if (score === 0) return "±0";
  return String(score);
}

function formatThemeDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || "-";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function themeItemsFromForecast(forecast) {
  const themes = Array.isArray(forecast?.annual_themes)
    ? forecast.annual_themes
    : Array.isArray(forecast?.annualThemes)
      ? forecast.annualThemes
      : [];
  const colors = ["#e9c349", "#d3bcf9", "#ffb4ab", "#c3c6d7"];
  return themes.map((theme, index) => {
    const period = `${formatThemeDate(theme.start_date || theme.startDate)}-${formatThemeDate(theme.end_date || theme.endDate)}`;
    const summary = theme.annual_summary || theme.annualSummary || "作成中";
    return {
      color: colors[index % colors.length],
      label: `${period}: ${summary}`,
      body: theme.annual_interpretation || theme.annualInterpretation || "作成中",
    };
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function monthIndex(dateValue) {
  const month = Number(String(dateValue || "").slice(5, 7));
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month - 1 : 0;
}

function monthlyData(forecast) {
  const source = Array.isArray(forecast?.yearly_data) ? forecast.yearly_data : [];
  if (!source.length) return demoForecast().yearly_data;
  return Array.from({ length: 12 }, (_, index) => {
    const items = source.filter((day) => monthIndex(day.date) === index);
    if (!items.length) {
      return {
        date: `2026-${String(index + 1).padStart(2, "0")}-01`,
        scores: { total: 0, general: 0, work: 0, love: 0, money: 0 },
        text_description: "",
      };
    }
    const scores = {};
    ["total", ...SCORE_KEYS.map((item) => item.key)].forEach((key) => {
      const values = items.map((day) => scoreFor(day, key)).filter((value) => Number.isFinite(value));
      scores[key] = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    });
    return {
      ...items[Math.floor(items.length / 2)],
      scores,
    };
  });
}

function chartX(index, count) {
  if (count <= 1) return CHART.left;
  return CHART.left + (index / (count - 1)) * (CHART.width - CHART.left - CHART.right);
}

function chartY(value) {
  const clamped = clamp(Number(value) || 0, -100, 100);
  return CHART.top + ((100 - clamped) / 200) * (CHART.height - CHART.top - CHART.bottom);
}

function nearestMonthIndexFromPointer(event, count) {
  const rect = event.currentTarget.ownerSVGElement
    ? event.currentTarget.ownerSVGElement.getBoundingClientRect()
    : event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * CHART.width;
  const ratio = (x - CHART.left) / (CHART.width - CHART.left - CHART.right);
  return clamp(Math.round(ratio * (count - 1)), 0, count - 1);
}

function smoothPath(points) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  const commands = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const controlX = (current.x + next.x) / 2;
    commands.push(
      `C ${controlX.toFixed(1)} ${current.y.toFixed(1)}, ${controlX.toFixed(1)} ${next.y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`
    );
  }
  return commands.join(" ");
}

function aggregateStats(data) {
  const totals = data.map((day) => scoreFor(day, "total"));
  const peakIndex = totals.reduce((best, score, index) => (score > totals[best] ? index : best), 0);
  const lowIndex = totals.reduce((best, score, index) => (score < totals[best] ? index : best), 0);
  const categoryAverages = SCORE_KEYS.map((item) => {
    const average = Math.round(data.reduce((sum, day) => sum + scoreFor(day, item.key), 0) / data.length);
    return { ...item, average };
  });
  const strongest = categoryAverages.reduce((best, item) => (item.average > best.average ? item : best), categoryAverages[0]);
  return {
    peak: data[peakIndex],
    low: data[lowIndex],
    strongest,
    stability: Math.round(100 - Math.min(70, Math.abs(scoreFor(data[peakIndex], "total") - scoreFor(data[lowIndex], "total")) / 2)),
  };
}

function GlassPanel({ children, className = "" }) {
  return (
    <section className={cx(
      "rounded-2xl border border-white/10 bg-[#1a1c1c]/62 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-xl",
      className
    )}>
      {children}
    </section>
  );
}

function Header() {
  return (
    <header className="border-b border-white/10 bg-[#0d0e0f]/82 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1540px] items-center justify-between gap-6 px-8 py-6">
        <div className="flex min-w-0 items-center gap-8">
          <a href="/results.html" className="font-serif text-4xl font-bold leading-none text-gold">The Celestial Atelier</a>
          <span className="hidden h-10 w-px bg-white/20 md:block" />
          <h1 className="truncate font-serif text-2xl font-semibold tracking-[0.04em] text-starlight md:text-3xl">
            2026年 運勢年間予測
          </h1>
        </div>
        <nav className="hidden items-center gap-10 font-mono text-xs font-bold tracking-[0.12em] text-mist lg:flex">
          <span className="border-b-2 border-gold pb-3 text-gold">Annual Forecast</span>
          <span>Monthly Matrix</span>
          <span>Daily Detail</span>
        </nav>
        <div className="flex items-center gap-4 text-gold">
          <Bell size={20} />
          <Sparkles size={22} />
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-gold/35 bg-gold/10">
            <Star size={19} />
          </div>
        </div>
      </div>
    </header>
  );
}

function OraclePanel({ stats, forecast }) {
  const [analysisMode, setAnalysisMode] = useState("deep");
  const themeItems = themeItemsFromForecast(forecast);
  const fallbackThemeItems = [
    { color: "#e9c349", label: "THEME 01", body: "作成中" },
    { color: "#d3bcf9", label: "THEME 02", body: "作成中" },
    { color: "#ffb4ab", label: "THEME 03", body: "作成中" },
  ];
  return (
    <div className="h-full">
      <GlassPanel className="h-full min-h-[760px] overflow-hidden p-7">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-serif text-3xl font-semibold text-starlight">
            {analysisMode === "theme" ? "Theme" : "Deep Analysis"}
          </h2>
          <div className="flex rounded-full border border-white/10 bg-white/[0.04] p-1 font-mono text-[11px] font-bold text-mist">
            {[
              ["deep", "Deep Analysis"],
              ["theme", "Theme"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setAnalysisMode(value)}
                className={cx(
                  "rounded-full px-3 py-1.5 transition",
                  analysisMode === value ? "bg-gold text-[#241a00]" : "hover:bg-white/10 hover:text-starlight"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 h-px bg-white/10" />
        {analysisMode === "theme" ? (
          <div className="mt-8 grid gap-8">
            {(themeItems.length ? themeItems : fallbackThemeItems).map((item) => (
              <article key={item.label} className="relative pl-8">
                <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full shadow-[0_0_18px_currentColor]" style={{ color: item.color, backgroundColor: item.color }} />
                <span className="absolute left-[5px] top-5 h-full w-px bg-white/15" />
                <p className="font-mono text-xs font-bold uppercase tracking-[0.12em]" style={{ color: item.color }}>
                  {item.label}
                </p>
                <p className="mt-3 text-base leading-8 text-mist">{item.body}</p>
              </article>
            ))}
          </div>
        ) : null}
        <div className={cx("mt-8 grid gap-8", analysisMode === "theme" && "hidden")}>
          {[
            {
              color: "#e9c349",
              label: `${MONTHS[monthIndex(stats.peak?.date)]}: ANNUAL PEAK`,
              body: `年間で最もスコアが高い月です。${stats.strongest?.label || "主要テーマ"}を軸に、重要な予定を前倒しで集約しやすいタイミングです。`,
            },
            {
              color: "#d3bcf9",
              label: `${stats.strongest?.label || "MAIN"}: STRONG SECTOR`,
              body: "カテゴリ別の平均値から、2026年を通して相対的に伸びやすい領域を抽出しています。",
            },
            {
              color: "#ffb4ab",
              label: `${MONTHS[monthIndex(stats.low?.date)]}: REVIEW POINT`,
              body: "年間の谷として扱う月です。無理に拡大するより、調整、見直し、保留判断を優先します。",
            },
          ].map((item) => (
            <article key={item.label} className="relative pl-8">
              <span className="absolute left-0 top-1.5 h-3 w-3 rounded-full shadow-[0_0_18px_currentColor]" style={{ color: item.color, backgroundColor: item.color }} />
              <span className="absolute left-[5px] top-5 h-full w-px bg-white/15" />
              <p className="font-mono text-xs font-bold uppercase tracking-[0.12em]" style={{ color: item.color }}>
                {item.label}
              </p>
              <p className="mt-3 text-base leading-8 text-mist">{item.body}</p>
            </article>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}

function AnnualChart({ data, stats, selectedSeriesKey, setSelectedSeriesKey, selectedMonthIndex, setSelectedMonthIndex }) {
  const selectedSeries = SCORE_KEYS.find((item) => item.key === selectedSeriesKey) || SCORE_KEYS[0];
  const selectedMonth = clamp(selectedMonthIndex, 0, data.length - 1);
  const selectedDay = data[selectedMonth] || data[0];
  const tooltipX = chartX(selectedMonth, data.length);
  const tooltipY = chartY(scoreFor(selectedDay, selectedSeries.key));
  const selectedPoints = data.map((day, index) => ({ x: chartX(index, data.length), y: chartY(scoreFor(day, selectedSeries.key)) }));
  const orderedSeries = [
    ...SCORE_KEYS.filter((item) => item.key !== selectedSeries.key),
    selectedSeries,
  ];
  const handleSeriesSelect = (event, key) => {
    setSelectedSeriesKey(key);
    setSelectedMonthIndex(nearestMonthIndexFromPointer(event, data.length));
  };
  return (
    <GlassPanel className="p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-serif text-5xl font-bold leading-tight text-starlight">Annual Biorhythm 2026</h2>
          <p className="mt-3 text-lg text-mist">Visualization of celestial influences across all major life sectors.</p>
        </div>
        <div className="flex flex-wrap gap-5 font-mono text-xs font-bold tracking-[0.08em] text-mist">
          {SCORE_KEYS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSelectedSeriesKey(item.key)}
              className={cx(
                "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 transition",
                selectedSeries.key === item.key ? "border-white/20 bg-white/10 text-starlight" : "border-transparent hover:border-white/15 hover:bg-white/5"
              )}
            >
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <svg className="mt-8 h-[360px] w-full" viewBox={`0 0 ${CHART.width} ${CHART.height}`} preserveAspectRatio="none" role="img" aria-label="年間運勢スコア折れ線グラフ">
        <defs>
          <linearGradient id="forecastGoldArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={selectedSeries.color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={selectedSeries.color} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[75, 25, -25, -75].map((tick) => (
          <line key={tick} x1={CHART.left} x2={CHART.width - CHART.right} y1={chartY(tick)} y2={chartY(tick)} stroke="rgba(255,255,255,0.07)" />
        ))}
        <path
          d={`${smoothPath(selectedPoints)} L ${CHART.width - CHART.right} ${CHART.height - CHART.bottom} L ${CHART.left} ${CHART.height - CHART.bottom} Z`}
          fill="url(#forecastGoldArea)"
        />
        {orderedSeries.map((item) => (
          <path
            key={item.key}
            onClick={(event) => handleSeriesSelect(event, item.key)}
            d={smoothPath(data.map((day, index) => ({ x: chartX(index, data.length), y: chartY(scoreFor(day, item.key)) })))}
            fill="none"
            stroke={item.color}
            strokeWidth={selectedSeries.key === item.key ? 4.6 : 2.1}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={selectedSeries.key === item.key ? 1 : 0.48}
            filter={selectedSeries.key === item.key ? "drop-shadow(0 0 12px rgba(233,195,73,0.22))" : "none"}
            className="cursor-pointer transition-opacity"
          />
        ))}
        {orderedSeries.map((item) => (
          <path
            key={`${item.key}-hit`}
            onClick={(event) => handleSeriesSelect(event, item.key)}
            d={smoothPath(data.map((day, index) => ({ x: chartX(index, data.length), y: chartY(scoreFor(day, item.key)) })))}
            fill="none"
            stroke="transparent"
            strokeWidth="18"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="cursor-pointer"
          />
        ))}
        <line x1={tooltipX} x2={tooltipX} y1={CHART.top} y2={CHART.height - CHART.bottom} stroke={selectedSeries.color} strokeDasharray="4 5" opacity="0.55" />
        <circle cx={tooltipX} cy={tooltipY} r="6" fill={selectedSeries.color} />
        <foreignObject x={clamp(tooltipX + 12, CHART.left, CHART.width - 170)} y={clamp(tooltipY - 62, 20, CHART.height - 130)} width="150" height="96">
          <div
            className="rounded-lg bg-[#1a1c1c]/80 p-3 backdrop-blur"
            style={{
              border: `1px solid ${selectedSeries.color}66`,
              boxShadow: `0 0 22px ${selectedSeries.color}1f`,
            }}
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: selectedSeries.color }}>{MONTHS[selectedMonth]}</p>
            <p className="mt-1 font-serif text-xl font-semibold text-starlight">{selectedSeries.label}</p>
            <p className="font-serif text-2xl text-starlight">{formatScore(scoreFor(selectedDay, selectedSeries.key))}</p>
          </div>
        </foreignObject>
        {MONTHS.map((month, index) => (
          <text key={month} x={chartX(index, data.length)} y={CHART.height - 8} textAnchor="middle" fill="#c7c6cc" fontSize="13" fontFamily="JetBrains Mono">
            {month}
          </text>
        ))}
      </svg>
    </GlassPanel>
  );
}

function Matrix({ data, selectedSeriesKey, selectedMonthIndex }) {
  return (
    <GlassPanel className="border-gold/25 p-8">
      <h2 className="font-serif text-3xl font-semibold text-gold">Monthly Forecast Matrix</h2>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[860px] table-fixed border-collapse font-mono text-sm">
          <thead>
            <tr className="border-b border-white/15 text-xs uppercase tracking-[0.12em] text-mist">
              <th className="w-[150px] py-3 pr-5 text-left">Sector</th>
              {MONTHS.map((month) => (
                <th key={month} className="px-3 py-3 text-right">{month}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SCORE_KEYS.map((item) => (
              <tr key={item.key} className="border-b border-white/10 last:border-0">
                <th className="py-5 pr-5 text-left font-sans text-base text-starlight">{item.label}</th>
                {data.map((day, index) => {
                  const score = scoreFor(day, item.key);
                  const isSelectedCell = item.key === selectedSeriesKey && index === selectedMonthIndex;
                  return (
                    <td
                      key={`${item.key}-${index}`}
                      className="px-2 py-3 text-right"
                    >
                      <span
                        className={cx(
                          "inline-flex h-10 w-full items-center justify-end rounded-lg px-2 transition",
                          score >= 0 ? "text-gold" : "text-outline",
                          isSelectedCell && "border border-[#8b7cf6]/70 bg-[#4f3d71]/38 text-base font-black text-[#ebdcff] shadow-[0_0_24px_rgba(139,124,246,0.34)]"
                        )}
                      >
                        {formatScore(score)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassPanel>
  );
}

function FooterStats({ stats }) {
  const items = [
    { label: "Annual Peak", value: MONTHS[monthIndex(stats.peak?.date)], icon: <Sparkles size={30} /> },
    { label: "Dominant Sector", value: stats.strongest?.label || "-", icon: <CircleDot size={30} /> },
    { label: "Stability", value: `${stats.stability}%`, icon: <Shield size={30} /> },
  ];
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {items.map((item) => (
        <GlassPanel key={item.label} className="flex items-end justify-between gap-5 p-7">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.15em] text-mist">{item.label}</p>
            <p className="mt-4 font-serif text-4xl font-semibold text-starlight">{item.value}</p>
          </div>
          <span className="text-gold">{item.icon}</span>
        </GlassPanel>
      ))}
    </div>
  );
}

function ForecastDetailPage() {
  const forecast = getForecast() || demoForecast();
  const data = useMemo(() => monthlyData(forecast), [forecast]);
  const stats = useMemo(() => aggregateStats(data), [data]);
  const [selectedSeriesKey, setSelectedSeriesKey] = useState("general");
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(monthIndex(stats.peak?.date));

  return (
    <div className="relative min-h-screen text-starlight">
      <Header />
      <main className="mx-auto grid max-w-[1540px] gap-7 px-8 py-24 lg:grid-cols-[380px_1fr]">
        <OraclePanel stats={stats} forecast={forecast} />
        <div className="grid gap-7">
          <AnnualChart
            data={data}
            stats={stats}
            selectedSeriesKey={selectedSeriesKey}
            setSelectedSeriesKey={setSelectedSeriesKey}
            selectedMonthIndex={selectedMonthIndex}
            setSelectedMonthIndex={setSelectedMonthIndex}
          />
          <Matrix data={data} selectedSeriesKey={selectedSeriesKey} selectedMonthIndex={selectedMonthIndex} />
          <FooterStats stats={stats} />
        </div>
      </main>
      <footer className="border-t border-white/10 bg-[#0d0e0f]/80 px-8 py-10">
        <div className="mx-auto flex max-w-[1540px] flex-col gap-4 text-mist md:flex-row md:items-center md:justify-between">
          <p className="font-serif text-2xl font-semibold text-gold">The Celestial Atelier</p>
          <p className="text-sm">Annual forecast detail. Dashboard remains independent.</p>
          <a href="/results.html" className="font-mono text-xs uppercase tracking-[0.18em] text-mist hover:text-gold">Back to Results</a>
        </div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("forecast-detail-root")).render(
  <React.StrictMode>
    <ForecastDetailPage />
  </React.StrictMode>
);
