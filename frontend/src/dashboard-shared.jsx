import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { currentTokyoDate, getStoredReadingForm, getStoredReadingResult, getStoredReadingResultAsync } from "./reading-storage.js";
import { MonthlyOverviewContent } from "./monthly-overview-content.jsx";
import { monthlyOverviewForDate } from "./monthly-overview.mjs";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Code2,
  Moon,
  Sparkles,
  Settings,
  UserCircle2,
  X,
} from "lucide-react";

export const dashboardData = {
  header: {
    brand: {
      name: "Celestial Logic",
      sublabel: "Transit Operations Dashboard",
    },
    actions: ["履歴", "マイページ", "プラン確認"],
  },
  dailyStarVibe: "",
  aspectHighlights: {
    positive: [],
    negative: [],
  },
  planetMotion: [
    { planet: "MERCURY", label: "水星", status: "direct", motion_tooltip: "次の逆行開始日: 2026年6月30日 蟹座26度15分" },
    { planet: "VENUS", label: "金星", status: "direct", motion_tooltip: "次の逆行開始日: 2026年10月3日 蠍座8度29分" },
    { planet: "MARS", label: "火星", status: "direct", motion_tooltip: "次の逆行開始日: 2027年1月10日 乙女座10度25分" },
    { planet: "JUPITER", label: "木星", status: "direct", motion_tooltip: "次の逆行開始日: 2026年12月13日 獅子座27度01分" },
    { planet: "SATURN", label: "土星", status: "direct", motion_tooltip: "次の逆行開始日: 2026年7月27日 牡羊座14度45分" },
    { planet: "URANUS", label: "天王星", status: "direct", motion_tooltip: "次の逆行開始日: 2026年9月11日 双子座5度41分" },
    { planet: "NEPTUNE", label: "海王星", status: "stationary", motion_tooltip: "次の逆行開始日: 2026年7月7日 牡羊座4度25分" },
    { planet: "PLUTO", label: "冥王星", status: "retrograde", motion_tooltip: "次の順行開始日: 2026年10月16日 水瓶座3度04分" },
  ],
  retrogradeCalendar: [
    { planet: "MERCURY", planet_label: "水星", event_label: "逆行開始", event_date: "2026-06-30", degree_display: "蟹座26°15′" },
    { planet: "MERCURY", planet_label: "水星", event_label: "順行開始", event_date: "2026-07-24", degree_display: "蟹座16°19′" },
    { planet: "PLUTO", planet_label: "冥王星", event_label: "順行開始", event_date: "2026-10-16", degree_display: "水瓶座3°04′" },
  ],
  countdown: {
    title: "恋愛運・追い風モード突入まで",
    daysLeft: 12,
    totalDays: 21,
    note:
      "無理に動くより、対話ログの整理と自分の本音の確認を優先するほど、次の追い風を活かしやすくなります。",
  },
};
function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function Panel({ title, eyebrow, children, className, headerAction, headerClassName, headerRowClassName, bodyClassName, bare = false }) {
  return (
    <section
      className={cx(
        bare ? "min-w-0" : "rounded-3xl border border-slate-200/90 bg-white/95 shadow-[0_18px_36px_rgba(10,25,47,0.08)] backdrop-blur-sm",
        className
      )}
    >
      <div className={cx(bare ? "" : "border-b border-slate-200/90 px-5 py-4 md:px-6", headerClassName)}>
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            {eyebrow}
          </p>
        ) : null}
        <div className={cx("flex flex-col gap-3 sm:flex-row sm:items-end", headerRowClassName)}>
          <h2 className="text-lg font-bold text-[#0A192F] md:text-xl">{title}</h2>
          {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
        </div>
      </div>
      <div className={cx(bare ? "" : "px-5 py-5 md:px-6 md:py-6", bodyClassName)}>{children}</div>
    </section>
  );
}

function DeveloperSourceList({ sources = [] }) {
  if (!Array.isArray(sources) || !sources.length) return null;

  return (
    <div className="space-y-2">
      {sources.map((source, index) => (
        <div
          key={`${source.csv || "source"}-${source.row || index}-${index}`}
          className="rounded-2xl border border-[#D4AF37]/20 bg-white/70 px-3 py-3"
        >
          <p className="text-xs font-semibold text-[#0A192F]">
            {source.csv || "CSV不明"}
            {source.row ? ` / 行 ${source.row}` : ""}
            {source.key ? ` / ${source.key}` : ""}
          </p>
          {Array.isArray(source.columns) && source.columns.length ? (
            <p className="mt-1 text-[11px] leading-5 text-slate-600">
              参照列: {source.columns.join(", ")}
            </p>
          ) : null}
          {source.note ? <p className="mt-1 text-[11px] leading-5 text-slate-500">{source.note}</p> : null}
        </div>
      ))}
    </div>
  );
}

function DeveloperBlock({ title = "開発者用", meta, className = "" }) {
  if (!meta) return null;

  return (
    <div className={cx("mt-5 rounded-3xl border border-dashed border-[#D4AF37]/35 bg-[#fffaf0] p-4", className)}>
      <div className="mb-3 flex items-center gap-2 text-[#0A192F]">
        <Code2 size={16} className="text-[#D4AF37]" />
        <p className="text-sm font-bold">{title}</p>
      </div>
      {meta.logic ? <p className="mb-3 text-sm leading-6 text-slate-700">{meta.logic}</p> : null}
      <DeveloperSourceList sources={meta.sources} />
    </div>
  );
}

function MotionDot({ status }) {
  const style = MOTION_STATUS_STYLES[status] || MOTION_STATUS_STYLES.direct;
  return (
    <span
      aria-hidden="true"
      className={cx("inline-block h-2.5 w-2.5 shrink-0 rounded-full", style.dot)}
    />
  );
}

function formatCalendarDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatIsoDate(value) {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      const [, year, month, day] = match;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dashboardDataDate(data = {}) {
  return formatIsoDate(
    data.readingDate ||
      data.reading_date ||
      data.date ||
      data.meta?.reading_date ||
      data.meta?.date
  );
}

function dashboardDisplayDate(data = {}) {
  return dashboardDataDate(data) || currentTokyoDate();
}

function addDaysToIsoDate(value, days) {
  const normalized = formatIsoDate(value) || formatIsoDate(new Date());
  if (!normalized) return "";
  const date = new Date(`${normalized}T12:00:00`);
  if (Number.isNaN(date.getTime())) return normalized;
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function resolveDashboardApiBaseUrl() {
  const configured = String(typeof __APP_API_BASE_URL__ === "undefined" ? "" : __APP_API_BASE_URL__ || "").trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname) && /^517\d$/.test(window.location.port)) {
    return "http://127.0.0.1:8000";
  }
  return typeof window === "undefined" ? "" : window.location.origin.replace(/\/$/, "");
}

async function postDashboardJson(path, payload) {
  const response = await fetch(`${resolveDashboardApiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.detail || `Request failed: ${response.status}`);
  }
  return response.json();
}

function dashboardDataFromReadingPayload(payload, fallbackData = {}, requestedDate = "") {
  if (!payload?.dashboard_data) return null;
  const yearlyForecast = payload.yearly_forecast || payload.yearlyForecast || fallbackData.yearly_forecast || fallbackData.yearlyForecast || null;
  return {
    ...payload.dashboard_data,
    readings: payload.readings || fallbackData.readings || [],
    meta: payload.meta || fallbackData.meta || {},
    chart_data: payload.chart_data || fallbackData.chart_data || {},
    yearly_forecast: yearlyForecast,
    reading_date:
      payload.dashboard_data.reading_date ||
      payload.dashboard_data.readingDate ||
      payload.reading_date ||
      payload.readingDate ||
      payload.meta?.reading_date ||
      payload.meta?.date ||
      formatIsoDate(requestedDate) ||
      fallbackData.reading_date ||
      fallbackData.readingDate ||
      fallbackData.meta?.reading_date ||
      fallbackData.meta?.date,
  };
}

function hasWeeklyAspectFeed(data = {}) {
  return Array.isArray(data.weekly_aspects) || Array.isArray(data.weeklyAspects);
}

function MotionIndicatorGrid({ items = [], compact = false }) {
  const motionItems = Array.isArray(items) ? items : [];
  return (
    <div className={cx("grid gap-x-5 gap-y-3", compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4")}>
      {motionItems.map((item) => {
        const tooltip =
          item.motion_tooltip ||
          item.motionTooltip ||
          item.next_motion_change?.label ||
          item.nextMotionChange?.label ||
          MOTION_STATUS_STYLES[item.status]?.label ||
          MOTION_STATUS_STYLES.direct.label;
        return (
          <div
            key={item.planet || item.label}
            className="group relative inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-200"
            tabIndex={0}
          >
            <MotionDot status={item.status} />
            <span className="truncate">{item.label || item.planet}</span>
            {tooltip ? (
              <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 min-w-max -translate-x-1/2 rounded-md border border-white/10 bg-slate-950 px-3 py-2 text-[11px] font-bold leading-none text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100">
                {tooltip}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function PlanetMotionPanel({ items = [], retrogradeCalendar = [], title = "", compact = false, className = "" }) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarSort, setCalendarSort] = useState("date");
  const motionItems = Array.isArray(items) ? items : [];
  const calendarItems = Array.isArray(retrogradeCalendar) ? retrogradeCalendar : [];
  const planetSortOrder = new Map(MOTION_PLANET_SORT_ORDER.map((planet, index) => [planet, index]));
  const sortedCalendarItems = [...calendarItems].sort((a, b) => {
    const dateCompare = String(a.event_date || "").localeCompare(String(b.event_date || ""));
    if (calendarSort === "planet") {
      const aPlanet = planetSortOrder.get(String(a.planet || "").toUpperCase()) ?? 999;
      const bPlanet = planetSortOrder.get(String(b.planet || "").toUpperCase()) ?? 999;
      return aPlanet - bPlanet || dateCompare;
    }
    return dateCompare || String(a.planet || "").localeCompare(String(b.planet || ""));
  });
  if (!motionItems.length) return null;

  return (
    <section className={cx("rounded-2xl border border-[#D4AF37]/20 bg-[#050A17]/70 p-4 sm:p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        {title ? (
          <p className="min-w-0 text-xs font-black tracking-[0.14em] text-[#D4AF37]">{title}</p>
        ) : null}
        {calendarItems.length ? (
          <button
            type="button"
            onClick={() => setIsCalendarOpen(true)}
            className="shrink-0 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-bold text-slate-100 transition hover:border-amber-300/70 hover:text-amber-200"
          >
            逆行カレンダー
          </button>
        ) : null}
      </div>
      {isCalendarOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div
            className="flex max-h-[86vh] overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl"
            style={{ width: "min(1120px, calc(100vw - 32px))" }}
          >
            <div className="flex min-h-0 w-full flex-col">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <p className="text-sm font-black tracking-[0.16em] text-slate-100">逆行カレンダー</p>
              <div className="flex items-center gap-2">
                <div className="grid grid-cols-2 rounded-full border border-white/10 bg-white/[0.04] p-1 text-[10px] font-bold text-slate-400">
                  {[
                    ["date", "時系列順"],
                    ["planet", "天体別順"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCalendarSort(value)}
                      className={cx(
                        "rounded-full px-3 py-1 transition",
                        calendarSort === value ? "bg-amber-400 text-slate-950" : "hover:bg-white/10 hover:text-slate-100"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setIsCalendarOpen(false)}
                  className="rounded-full border border-white/10 px-3 py-1 text-xs font-bold text-slate-300 transition hover:border-amber-300 hover:text-amber-200"
                >
                  閉じる
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-6">
              <div className="grid gap-2">
                {sortedCalendarItems.map((item, index) => (
                  <div
                    key={`${item.planet || item.planet_label}-${item.event_date}-${item.event_label}-${index}`}
                    className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 sm:grid-cols-[92px_92px_1fr]"
                  >
                    <span className="font-bold text-slate-100">{item.planet_label || item.label || item.planet}</span>
                    <span className={cx(
                      "font-bold",
                      String(item.event_type || "").includes("RETROGRADE") || item.event_label === "逆行開始"
                        ? "text-rose-300"
                        : "text-sky-300"
                    )}>
                      {item.event_label || item.event_type}
                    </span>
                    <span className="text-slate-300">
                      {formatCalendarDate(item.event_date)} {item.degree_display || item.degreeDisplay || ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="shrink-0 border-t border-white/10 bg-slate-950/95 px-5 py-4">
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-bold text-slate-300">
                {Object.entries(MOTION_STATUS_STYLES).map(([status, style]) => (
                  <span key={status} className="inline-flex items-center gap-2">
                    <MotionDot status={status} />
                    {style.label}
                  </span>
                ))}
              </div>
              <MotionIndicatorGrid items={motionItems} compact={compact} />
            </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FixedMotionSidebar({ items = [], retrogradeCalendar = [] }) {
  const [isOpen, setIsOpen] = useState(false);
  const motionItems = Array.isArray(items) ? items : [];
  if (!motionItems.length) return null;

  return (
    <div className="fixed left-4 top-[88px] z-40">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-[#D4AF37]/30 bg-[#050A17] text-lg font-black text-[#D4AF37] shadow-[0_14px_40px_rgba(3,7,18,0.22)] transition hover:border-[#D4AF37]/70"
        aria-expanded={isOpen}
        aria-label="サイドバーメニュー"
      >
        {isOpen ? "＜" : "＞"}
      </button>
      {isOpen ? (
        <div className="mt-3 w-[280px] rounded-[1.5rem] border border-[#D4AF37]/20 bg-[#050A17]/95 p-3 shadow-[0_24px_80px_rgba(3,7,18,0.42)] backdrop-blur-xl">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Side Menu</p>
          <PlanetMotionPanel
            items={motionItems}
            retrogradeCalendar={retrogradeCalendar}
            title="順行逆行カレンダー"
            compact
            className="border-white/10 bg-slate-950/30 p-3 sm:p-3"
          />
        </div>
      ) : null}
    </div>
  );
}

function PersonalAspectHighlights({ positive = [], negative = [] }) {
  const groups = [
    {
      key: "positive",
      title: "",
      label: "追い風",
      items: positive,
      borderClass: "border-sky-300/35",
      badgeClass: "bg-sky-300/14 text-sky-200",
      scoreClass: "text-sky-200",
    },
    {
      key: "negative",
      title: "",
      label: "負荷・消耗注意",
      items: negative,
      borderClass: "border-rose-300/25",
      badgeClass: "bg-rose-300/12 text-rose-200",
      scoreClass: "text-rose-200",
    },
  ];

  return (
    <div className="mt-6 space-y-3">
      {groups.map((group) => (
        <details
          key={group.key}
          className={cx(
            "group overflow-hidden rounded-2xl border bg-white/[0.04] py-3 text-slate-200",
            group.borderClass
          )}
        >
          <summary className="cursor-pointer list-none px-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold", group.badgeClass)}>
                  <span className="transition-transform duration-150 group-open:rotate-90">▶</span>
                  <span>{group.label}</span>
                </span>
                {group.title ? <span className="truncate text-sm font-bold">{group.title}</span> : null}
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-slate-500">
                {group.items.length}件
              </span>
            </div>
          </summary>
          <div className="mt-3 space-y-3">
            {group.items.length ? (
              group.items.map((item, index) => {
                const score = Number(item.score || 0);
                return (
                  <article key={`${group.key}-${item.label || index}`} className="border-y border-white/10 bg-slate-950/35 px-4 py-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 break-words text-xs font-bold leading-5 text-slate-200">
                        {index + 1}. {item.label || "アスペクト"}
                      </p>
                      <span className={cx("shrink-0 text-xs font-black", group.scoreClass)}>
                        {score > 0 ? "+" : ""}
                        {score}
                      </span>
                    </div>
                    {item.description ? (
                      <p className="break-words text-sm font-light leading-7 text-slate-300">
                        {item.description}
                      </p>
                    ) : null}
                    {item.advisedTask ? (
                      <p className="mt-2 break-words border-l border-white/10 pl-3 text-xs leading-6 text-slate-400">
                        {item.advisedTask}
                      </p>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <p className="border-y border-white/10 bg-slate-950/35 px-4 py-3 text-sm leading-6 text-slate-500">
                該当アスペクトなし
              </p>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}

function CountdownDirectionArrow({ percent, direction = 'approach' }) {
  const isDeparting = direction === 'departing';
  const points = isDeparting ? '20 4 4 12 20 20' : '4 4 20 12 4 20';
  const stroke = isDeparting ? 'rgb(30 41 59)' : 'rgb(253 224 71)';

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 z-20 h-6 w-6 overflow-visible transition-all duration-1000 ease-out"
      style={{
        left: `${percent}%`,
        transform: isDeparting ? 'translate(-4px, -50%)' : 'translate(-20px, -50%)',
      }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={isDeparting ? undefined : "drop-shadow-[0_0_8px_rgba(253,224,71,0.65)]"}
      />
    </svg>
  );
}

function CountdownLane({
  title,
  slides,
  activeIndex,
  setActiveIndex,
  maxSlides = 6,
  headerAction = null,
  showProgressLabel = true,
  showPeakMarker = false,
  showDirectionArrow = false,
  useOrbProgress = false,
  departurePrefix = "離脱まであと",
}) {
  const [touchStartX, setTouchStartX] = useState(null);
  const hasSlides = Array.isArray(slides) && slides.length > 0;
  if (!hasSlides) {
    return (
      <div className="flex min-h-[300px] flex-col rounded-3xl border border-slate-800 bg-slate-900 p-5 text-sm font-semibold text-slate-500 shadow-xl md:p-6">
        {headerAction ? (
          <div className="mb-3 flex min-h-[34px] items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <p className="inline-flex h-8 min-w-[116px] shrink-0 items-center justify-center rounded-full border border-white/70 bg-white px-3 text-[11px] font-bold tracking-[0.12em] text-slate-900">
                {title}テーマ
              </p>
              <div className="shrink-0">{headerAction}</div>
            </div>
          </div>
        ) : null}
        <div className="flex flex-1 items-center justify-center text-center">
          <div>
            {!headerAction ? (
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-600">{title}</p>
            ) : null}
            対象アスペクトなし
          </div>
        </div>
      </div>
    );
  }

  const visibleSlides = Number.isFinite(maxSlides) ? slides.slice(0, maxSlides) : slides;
  const clampedIndex = Math.max(0, Math.min(activeIndex, visibleSlides.length - 1));
  const activeSlide = visibleSlides[clampedIndex] || visibleSlides[0];
  const daysRemaining = Number(activeSlide.days_remaining ?? activeSlide.daysLeft ?? 0);
  const totalDays = Number(activeSlide.total_days ?? activeSlide.totalDays ?? 0);
  const hoursRemaining = countdownHoursUntil(activeSlide);
  const totalHours = Number(activeSlide.total_hours ?? activeSlide.totalHours ?? activeSlide.scan?.total_hours);
  const usesHourCountdown = isTransitMoonAspect(activeSlide) && Number.isFinite(hoursRemaining) && hoursRemaining < 24;
  const remainingAmount = usesHourCountdown ? hoursRemaining : daysRemaining;
  const totalAmount = usesHourCountdown && Number.isFinite(totalHours) ? totalHours : totalDays;
  const countdownUnit = usesHourCountdown ? "時間" : "日";
  const percent = Math.max(0, Math.min(100, Math.round(totalAmount > 0 ? ((totalAmount - remainingAmount) / totalAmount) * 100 : 0)));
  const rawOrbPercent = activeSlide.orb_percent ?? activeSlide.orbPercent ?? activeSlide.scan?.orb_percent;
  const currentOrbValue = Number(
    activeSlide.current_orb ??
    activeSlide.currentOrb ??
    activeSlide.scan?.current_orb ??
    activeSlide.target?._input?.orb ??
    activeSlide.target?._input?.orb_diff ??
    activeSlide.target?.orb ??
    activeSlide.target?.Orb
  );
  const thresholdOrbValue = Number(activeSlide.threshold_orb ?? activeSlide.thresholdOrb ?? activeSlide.target?.threshold_orb ?? 5);
  const calculatedOrbPercent =
    Number.isFinite(currentOrbValue) && Number.isFinite(thresholdOrbValue) && thresholdOrbValue > 0
      ? 100 - ((currentOrbValue / thresholdOrbValue) * 100)
      : NaN;
  const orbPercentValue = Number(rawOrbPercent ?? calculatedOrbPercent);
  const isNegativeCountdown = String(activeSlide.countdown_mode || '').trim().toLowerCase() === 'departure';
  const clampedOrbPercent = Number.isFinite(orbPercentValue)
    ? Math.max(0, Math.min(100, Math.round(orbPercentValue)))
    : NaN;
  const departureFallbackPercent = isNegativeCountdown && daysRemaining > 0
    ? Math.max(8, Math.min(100, Math.round((daysRemaining / Math.max(totalDays, daysRemaining, 1)) * 100)))
    : NaN;
  const barPercent = (useOrbProgress || isNegativeCountdown)
    ? Number.isFinite(clampedOrbPercent) && clampedOrbPercent > 0
      ? clampedOrbPercent
      : Number.isFinite(departureFallbackPercent)
        ? departureFallbackPercent
        : percent
    : percent;
  const elapsedAmount = Math.max(0, totalAmount - remainingAmount);
  const progressLabel = `進行度 ${elapsedAmount}/${totalAmount || 0}${countdownUnit} (${percent}%)`;
  const note = String(activeSlide.note || '').trim();
  const aspectLabel = String(activeSlide.aspect_label || '').trim();
  const scanStatus = String(activeSlide.scan_status || activeSlide.scan?.scan_status || '').trim();
  const isDepartingPeak =
    isNegativeCountdown ||
    scanStatus === 'departing' ||
    scanStatus === 'separating' ||
    scanStatus === 'retrograde_turning_away' ||
    scanStatus === 'turning_away';
  const isRetrogradeTurnaway =
    scanStatus === 'retrograde_turning_away' ||
    (scanStatus === 'turning_away' && activeSlide.scan?.peak_retrograde === true);
  const isPositiveAfterPeak = !isNegativeCountdown && (
    scanStatus === 'turning_away' ||
    scanStatus === 'retrograde_turning_away'
  );
  const exitDaysRemaining = Number(activeSlide.exit_days_remaining ?? activeSlide.departure_days_remaining ?? activeSlide.exitDaysRemaining ?? daysRemaining);
  const postPeakLabel =
    isPositiveAfterPeak && barPercent >= 67
      ? "ピーク通過"
      : isPositiveAfterPeak && barPercent >= 34
        ? "影響下"
        : "";
  const countdownPrefix =
    isPositiveAfterPeak && !postPeakLabel
      ? departurePrefix
      : isRetrogradeTurnaway || scanStatus === 'closest'
        ? '最接近まで あと'
        : 'あと';
  const displayedDays = isPositiveAfterPeak && !postPeakLabel && Number.isFinite(exitDaysRemaining)
    ? Math.max(0, Math.round(exitDaysRemaining))
    : daysRemaining;
  const displayedCountdown = usesHourCountdown ? Math.max(0, Math.round(hoursRemaining)) : displayedDays;
  const isInfluenceDeparturePrefix = countdownPrefix === "影響下から離脱するまであと";
  const countdownSuffix = '';
  const goToSlide = (index) => {
    if (visibleSlides.length <= 0) return;
    setActiveIndex((index + visibleSlides.length) % visibleSlides.length);
  };
  const handleTouchEnd = (event) => {
    if (touchStartX === null || visibleSlides.length <= 1) return;
    const deltaX = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(deltaX) >= 40) {
      const nextIndex = deltaX < 0 ? clampedIndex + 1 : clampedIndex - 1;
      goToSlide(nextIndex);
    }
    setTouchStartX(null);
  };

  return (
    <div
      className="group relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl md:p-6"
      onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
      onTouchEnd={handleTouchEnd}
    >
      <div
        className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-500/10 blur-3xl transition-all duration-1000"
        style={{ opacity: barPercent / 100 }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent transition-opacity duration-1000"
        style={{ opacity: barPercent / 100 }}
      />

      <div className="relative flex min-h-[300px] flex-col">
        <div className="mb-3 flex min-h-[34px] items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <p className="inline-flex h-8 min-w-[116px] shrink-0 items-center justify-center rounded-full border border-white/70 bg-white px-3 text-[11px] font-bold tracking-[0.12em] text-slate-900">
              {title}テーマ
            </p>
            {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
          </div>
          <div className="flex shrink-0 items-start">
            <span className={cx("text-right text-sm font-bold text-amber-500", !showProgressLabel && "hidden")}>
              {progressLabel}
            </span>
          </div>
        </div>
        <div className="mb-3 flex min-h-[58px] items-start justify-between gap-4 text-sm font-medium text-slate-400">
          <div className="min-w-0">
            {aspectLabel ? (
              <p className={cx(
                "mb-1 truncate text-[10px] font-normal uppercase tracking-[0.16em]",
                isNegativeCountdown ? "text-rose-300/85" : "text-slate-600"
              )}>
                {aspectLabel}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mb-3 h-[84px]">
          <div className="flex h-full min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            {postPeakLabel === "ピーク通過" ? (
              <div className="flex basis-full flex-col items-start gap-1">
                <div className="flex items-baseline gap-x-2">
                  <span className="text-base text-slate-500 sm:text-lg">あと</span>
                  <span className="text-4xl font-bold tracking-tighter text-white sm:text-5xl">
                    0
                  </span>
                  <span className="text-base text-slate-500 sm:text-lg">{countdownUnit}</span>
                </div>
                <span className="text-sm font-semibold leading-5 text-slate-300 sm:text-base">
                  ピーク通過/影響継続中
                </span>
              </div>
            ) : postPeakLabel ? (
              <div className="flex basis-full flex-col items-start gap-1">
                <div className="flex items-baseline gap-x-2">
                  <span className="text-base text-slate-500 sm:text-lg">あと</span>
                  <span className="text-4xl font-bold tracking-tighter text-white sm:text-5xl">
                    0
                  </span>
                  <span className="text-base text-slate-500 sm:text-lg">{countdownUnit}</span>
                </div>
                <span className="text-sm font-semibold leading-5 text-slate-300 sm:text-base">
                  ピーク通過
                </span>
              </div>
            ) : isInfluenceDeparturePrefix ? (
              <div className="flex basis-full flex-col items-start gap-1">
                <div className="flex items-baseline gap-x-2">
                  <span className="text-base text-slate-500 sm:text-lg">あと</span>
                  <span className="text-4xl font-bold tracking-tighter text-white sm:text-5xl">
                    0
                  </span>
                  <span className="text-base text-slate-500 sm:text-lg">{countdownUnit}</span>
                </div>
                <span className="text-sm font-semibold leading-5 text-slate-300 sm:text-base">
                  影響下/現在離脱中
                </span>
              </div>
            ) : (
              <>
                <span className="text-base text-slate-500 sm:text-lg">{countdownPrefix}</span>
                <span className="text-4xl font-bold tracking-tighter text-white sm:text-5xl">
                  {displayedCountdown}
                </span>
                <span className="text-base text-slate-500 sm:text-lg">{countdownUnit}</span>
              </>
            )}
            {countdownSuffix ? (
              <p className="basis-full whitespace-normal break-words text-left text-[10px] font-medium leading-5 text-slate-500">
                {countdownSuffix}
              </p>
            ) : null}
          </div>
        </div>

        <div className={cx("mb-4 w-full shrink-0", showPeakMarker && "pt-5")}>
          <div className="relative">
            {showPeakMarker ? (
              <>
                <div className="absolute left-2 top-1/2 z-30 -translate-y-1/2 text-left text-[10px] font-bold leading-none tracking-[0.08em] text-slate-500">
                  ◀離脱
                </div>
                <div className="absolute right-2 top-1/2 z-30 -translate-y-1/2 text-right text-[10px] font-bold leading-none tracking-[0.08em] text-amber-300">
                  ピーク▶
                </div>
              </>
            ) : null}
            <div className="relative h-2 w-full">
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-700 via-amber-500 to-yellow-300 shadow-[0_0_15px_rgba(245,158,11,0.5)] transition-all duration-1000 ease-out"
                  style={{ width: `${barPercent}%` }}
                />
              </div>
              {showDirectionArrow ? (
                <CountdownDirectionArrow
                  percent={barPercent}
                  direction={isDepartingPeak ? 'departing' : 'approach'}
                />
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-h-[36px]">
          {note ? (
            <p className="line-clamp-2 text-xs italic leading-relaxed text-slate-400 opacity-80 transition-opacity group-hover:opacity-100">
              {note}
            </p>
          ) : null}
        </div>

        {visibleSlides.length > 1 ? (
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => goToSlide(clampedIndex - 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-800/70 text-slate-300 transition hover:border-amber-500 hover:text-amber-300"
              aria-label={`${title} 前のアスペクト`}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex min-w-[72px] max-w-[260px] flex-wrap items-center justify-center gap-2">
              {visibleSlides.map((slide, index) => (
              <button
                key={`${slide.countdown_id || slide.title || index}-${index}`}
                type="button"
                onClick={() => goToSlide(index)}
                className={`h-2 rounded-full transition-all ${index === clampedIndex ? "w-7 bg-amber-500" : "w-2.5 bg-slate-700"}`}
                aria-label={`${title} ${index + 1}`}
              />
              ))}
            </div>
            <button
              type="button"
              onClick={() => goToSlide(clampedIndex + 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-800/70 text-slate-300 transition hover:border-amber-500 hover:text-amber-300"
              aria-label={`${title} 次のアスペクト`}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function countdownSlideKey(slide) {
  if (!slide) return "";
  if (slide.event_id) return slide.event_id;
  const target = slide.target || {};
  return [
    slide.countdown_id || slide.trigger_id || "",
    target.T_Planet || slide.t_planet || "",
    target.N_Planet || slide.n_planet || "",
    target.Aspect_Angle || slide.aspect_angle || "",
    slide.countdown_mode || "",
  ].join("|");
}

function aspectFocusKey(value) {
  if (!value) return "";
  const target = value.target || value;
  return [
    target.Countdown_ID || value.countdown_id || value.trigger_id || "",
    target.T_Planet || value.t_planet || value.transit_planet || "",
    target.N_Planet || value.n_planet || value.natal_planet || "",
    target.Aspect_Angle || value.aspect_angle || value.angle || "",
  ].map((item) => String(item || "").trim().toUpperCase()).join("|");
}

function isTransitMoonAspect(slide) {
  const target = slide?.target || {};
  const planet = String(target.T_Planet || slide?.t_planet || slide?.transit_planet || "").trim().toUpperCase();
  const transitPlanet = planet.replace(/^TRANSIT_/, "");
  return transitPlanet === "MOON";
}

function dateKeyToLocalDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function countdownDaysUntil(slide, baseDateKey = "") {
  const explicitDays = Number(
    slide?.days_remaining ??
    slide?.daysRemaining ??
    slide?.daysLeft ??
    slide?.days_left
  );
  if (Number.isFinite(explicitDays)) {
    return explicitDays;
  }

  const targetDate = dateKeyToLocalDate(
    slide?.target_date ||
    slide?.targetDate ||
    slide?.event_date ||
    slide?.eventDate ||
    slide?.peak_date ||
    slide?.peakDate ||
    slide?.date
  );
  if (!targetDate) return null;
  const baseDate = dateKeyToLocalDate(baseDateKey) || new Date();
  const baseMidnight = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  return Math.ceil((targetDate.getTime() - baseMidnight.getTime()) / 86400000);
}

function countdownHoursUntil(slide) {
  const rawHours =
    slide?.hours_remaining ??
    slide?.hoursRemaining ??
    slide?.hoursLeft ??
    slide?.hours_left ??
    slide?.scan?.hours_remaining;
  if (rawHours === null || rawHours === undefined || rawHours === "") return null;
  const explicitHours = Number(rawHours);
  return Number.isFinite(explicitHours) ? explicitHours : null;
}

function countdownRemainingValue(slide, baseDateKey = "") {
  const hours = countdownHoursUntil(slide);
  if (Number.isFinite(hours)) {
    if (hours < 24) {
      return { value: Math.max(0, Math.round(hours)), unit: "時間", sortHours: hours };
    }
    return { value: Math.max(0, Math.ceil(hours / 24)), unit: "日", sortHours: hours };
  }
  const days = countdownDaysUntil(slide, baseDateKey);
  return {
    value: Number.isFinite(days) ? days : null,
    unit: "日",
    sortHours: Number.isFinite(days) ? days * 24 : null,
  };
}

function isPressureCountdown(slide) {
  if (!slide) return false;
  const mode = String(slide.countdown_mode || slide.countdownMode || "").trim().toLowerCase();
  const scanStatus = String(slide.scan_status || slide.scan?.scan_status || "").trim().toLowerCase();
  const score = Number(slide.target?.Score_Impact ?? slide.score_impact ?? slide.scoreImpact);
  return mode === "departure" || scanStatus === "departing" || (Number.isFinite(score) && score < 0);
}

function isDepartureCountdown(slide) {
  const mode = String(slide?.countdown_mode || slide?.countdownMode || "").trim().toLowerCase();
  const scanStatus = String(slide?.scan_status || slide?.scan?.scan_status || "").trim().toLowerCase();
  return mode === "departure" || scanStatus === "departing";
}

function pressureImpactHasEnded(item, displayDate) {
  const impactEnd = dateKeyToLocalDate(
    item?.impact_end_date ||
      item?.impactEndDate ||
      item?.scan?.impact_end_date ||
      item?.scan?.impactEndDate
  );
  const activeDate = dateKeyToLocalDate(displayDate);
  return Boolean(impactEnd && activeDate && impactEnd.getTime() < activeDate.getTime());
}

function pressureCountdownItems(data, groups, displayDate) {
  const explicitItems = [
    ...(Array.isArray(data?.pressure_countdown_items) ? data.pressure_countdown_items : []),
    ...(Array.isArray(groups?.pressure) ? groups.pressure : []),
  ];
  const fallbackItems = [
    ...(Array.isArray(groups?.short) ? groups.short : []),
    ...(Array.isArray(groups?.long) ? groups.long : []),
    ...(Array.isArray(groups?.legacy_short) ? groups.legacy_short : []),
    ...(Array.isArray(groups?.legacy_long) ? groups.legacy_long : []),
  ];
  const rawItems = (explicitItems.length ? explicitItems : fallbackItems).filter((item) => {
    if (!item || !isPressureCountdown(item)) return false;
    if (pressureImpactHasEnded(item, displayDate)) return false;
    const daysUntil = countdownDaysUntil(item, displayDate);
    if (item.countdown_unavailable || item.countdownUnavailable || item.impact_end_is_after || item.impactEndIsAfter) return true;
    return daysUntil !== null && daysUntil >= 0 && daysUntil <= 365;
  });
  const seen = new Set();
  return rawItems.filter((item) => {
    const key = countdownSlideKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => {
    const leftHours = countdownRemainingValue(left, displayDate).sortHours;
    const rightHours = countdownRemainingValue(right, displayDate).sortHours;
    return (Number.isFinite(leftHours) ? leftHours : 999999) - (Number.isFinite(rightHours) ? rightHours : 999999);
  });
}

function reliefCountdownItems(data, groups, displayDate) {
  const explicitItems = [
    ...(Array.isArray(data?.relief_countdown_items) ? data.relief_countdown_items : []),
    ...(Array.isArray(groups?.relief) ? groups.relief : []),
  ];
  const fallbackItems = [
    ...(Array.isArray(data?.countdown_items) ? data.countdown_items : []),
    ...(Array.isArray(groups?.short) ? groups.short : []),
    ...(Array.isArray(groups?.long) ? groups.long : []),
  ];
  const rawItems = (explicitItems.length ? explicitItems : fallbackItems).filter((item) => {
    if (!item) return false;
    const target = item.target && typeof item.target === "object" ? item.target : item;
    const score = Number(target.Score_Impact ?? target.score_impact ?? target.scoreImpact);
    const daysUntil = countdownDaysUntil(item, displayDate);
    return score >= 25 && daysUntil !== null && daysUntil >= 0 && daysUntil <= 365;
  });
  const seen = new Set();
  return rawItems.filter((item) => {
    const key = countdownSlideKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((left, right) => {
    const phaseDifference = Number(isDepartureCountdown(left)) - Number(isDepartureCountdown(right));
    if (phaseDifference !== 0) return phaseDifference;
    const leftHours = countdownRemainingValue(left, displayDate).sortHours;
    const rightHours = countdownRemainingValue(right, displayDate).sortHours;
    return (Number.isFinite(leftHours) ? leftHours : 999999) - (Number.isFinite(rightHours) ? rightHours : 999999);
  });
}

function weeklyAspectDateLabel(item) {
  const formatDate = (value) => {
    const date = dateKeyToLocalDate(value);
    if (!date) return "";
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };
  const startLabel = formatDate(item?.start_date || item?.startDate || item?.date || item?.target_date || item?.event_date);
  const endLabel = formatDate(item?.end_date || item?.endDate || item?.date || item?.target_date || item?.event_date);
  if (startLabel && endLabel) {
    return startLabel === endLabel ? `影響期間 ${startLabel}` : `影響期間 ${startLabel}〜${endLabel}`;
  }
  const days = Number(item?.days_until ?? item?.daysUntil);
  if (Number.isFinite(days)) {
    if (days === 0) return "今日";
    if (days === 1) return "明日";
    return `${days}日後`;
  }
  return "";
}

function weeklyAspectItemKey(item, index) {
  return [
    aspectFocusKey(item),
    item?.start_date || item?.startDate || item?.date || item?.target_date || item?.event_date || "",
    item?.end_date || item?.endDate || "",
    index,
  ].join("|");
}

function RainbowFocusStyle() {
  return (
    <style>
      {`
        @keyframes celestialRainbowFlash {
          0% { box-shadow: 0 0 0 rgba(233, 195, 73, 0), 0 0 0 rgba(56, 189, 248, 0); }
          35% { box-shadow: 0 0 16px rgba(233, 195, 73, 0.22), 0 0 26px rgba(56, 189, 248, 0.14); }
          100% { box-shadow: 0 0 0 rgba(233, 195, 73, 0), 0 0 0 rgba(56, 189, 248, 0); }
        }
        @keyframes celestialRainbowSpinOnce {
          0% { transform: rotate(0deg); opacity: 0.74; }
          18% { opacity: 1; }
          100% { transform: rotate(360deg); opacity: 0.74; }
        }
        .celestial-rainbow-focus {
          position: relative;
          border-color: transparent;
          animation: celestialRainbowFlash 1.25s ease-out 1 forwards;
        }
        .celestial-rainbow-focus::before {
          content: "";
          position: absolute;
          inset: -1px;
          z-index: 0;
          border-radius: inherit;
          background: conic-gradient(from 0deg, rgba(244,114,182,0.78), rgba(234,179,8,0.74), rgba(74,222,128,0.72), rgba(56,189,248,0.76), rgba(167,139,250,0.76), rgba(244,114,182,0.78));
          animation: celestialRainbowSpinOnce 1.25s ease-out 1 forwards;
        }
        .celestial-rainbow-focus::after {
          content: "";
          position: absolute;
          inset: 2px;
          z-index: 0;
          border-radius: calc(0.75rem - 1px);
          background: rgba(12, 14, 18, 0.94);
        }
        .celestial-rainbow-focus > * {
          position: relative;
          z-index: 1;
        }
      `}
    </style>
  );
}

function WeeklyAspectList({ items = [], focusKey = "", focusToken = 0 }) {
  const weeklyAspects = Array.isArray(items) ? items : [];
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const focusedItemRef = React.useRef(null);
  const toggleOpen = (key) => {
    setOpenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };
  useEffect(() => {
    if (!focusKey || !focusedItemRef.current) return;
    setOpenKeys((current) => {
      const next = new Set(current);
      weeklyAspects.forEach((item, index) => {
        if (aspectFocusKey(item) === focusKey) {
          next.add(weeklyAspectItemKey(item, index));
        }
      });
      return next;
    });
    focusedItemRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusKey, focusToken, weeklyAspects.length]);
  if (!weeklyAspects.length) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-center text-xs font-bold leading-5 text-[#909096]">
        直近1週間の表示対象アスペクトはありません
      </div>
    );
  }
  return (
    <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin]">
      <RainbowFocusStyle />
      {weeklyAspects.map((item, index) => {
        const isFocused = Boolean(focusKey) && aspectFocusKey(item) === focusKey;
        const itemKey = weeklyAspectItemKey(item, index);
        const isOpen = openKeys.has(itemKey);
        const body = item.description || item.advisedTask || "解釈文がありません。";
        return (
          <article
            ref={isFocused ? focusedItemRef : null}
            key={itemKey}
            className={cx(
              "overflow-hidden rounded-xl border transition",
              isFocused
                ? "celestial-rainbow-focus bg-[#e9c349]/12"
                : "border-white/10 bg-white/[0.035]"
            )}
          >
            <button
              type="button"
              onClick={() => toggleOpen(itemKey)}
              className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left transition hover:bg-white/[0.04] sm:px-4"
            >
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.12em] text-[#e9c349]">
                  {weeklyAspectDateLabel(item)}
                </p>
                <p className="mt-2 text-xs font-black leading-5 text-[#f3f3f0] sm:text-sm sm:leading-6">
                  {item.label || item.title || "アスペクト"}
                </p>
              </div>
              <span
                className={cx(
                  "mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-lg font-black leading-none text-[#e9c349] transition",
                  isOpen && "rotate-90 border-[#e9c349]/45 bg-[#e9c349]/10"
                )}
                aria-hidden="true"
              >
                ›
              </span>
            </button>
            {isOpen ? (
              <div className="border-t border-white/10 px-3 pb-4 pt-3 sm:px-4">
                <p className="whitespace-pre-line text-[11px] leading-6 text-[#c7c6cc] sm:text-sm sm:leading-7">
                  {body}
                </p>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function LunarCountdownWidget({ data, items = [], groups = {}, developerMode = false, developerMeta = {} }) {
  const [shortIndex, setShortIndex] = useState(0);
  const [longIndex, setLongIndex] = useState(0);
  const [longPriority, setLongPriority] = useState("high");
  const priorityBands = groups?.priority_bands || {
    high: { label: "高" },
    middle: { label: "中" },
    low: { label: "低" },
  };

  const shortSlides =
    Array.isArray(groups?.short) && groups.short.length
      ? groups.short
      : Array.isArray(groups?.legacy_short) && groups.legacy_short.length
        ? groups.legacy_short
        : data
          ? [data]
          : Array.isArray(items) && items.length
            ? items.slice(0, 1)
            : [];
  const longSlides =
    groups?.long_by_priority && Array.isArray(groups.long_by_priority[longPriority])
      ? groups.long_by_priority[longPriority]
      : Array.isArray(groups?.long) && groups.long.length
      ? groups.long
      : Array.isArray(groups?.legacy_long) && groups.legacy_long.length
        ? groups.legacy_long
        : [];

  useEffect(() => {
    if (!Array.isArray(longSlides) || !longSlides.length) return;
    try {
      const lockedKey = window.localStorage.getItem(`celestial-atelier:long-countdown:${longPriority}`);
      if (!lockedKey) return;
      const lockedIndex = longSlides.findIndex((slide) => countdownSlideKey(slide) === lockedKey);
      if (lockedIndex >= 0) {
        setLongIndex(lockedIndex);
      }
    } catch {
      // Storage is best-effort; countdown still works without it.
    }
  }, [longPriority, longSlides]);

  useEffect(() => {
    if (!Array.isArray(longSlides) || !longSlides.length) return;
    const activeSlide = longSlides[Math.max(0, Math.min(longIndex, longSlides.length - 1))];
    const key = countdownSlideKey(activeSlide);
    if (!key) return;
    try {
      window.localStorage.setItem(`celestial-atelier:long-countdown:${longPriority}`, key);
    } catch {
      // Storage is best-effort; countdown still works without it.
    }
  }, [longIndex, longPriority, longSlides]);

  const longPriorityControl = (
    <div className="flex h-8 w-[156px] items-center gap-2">
      <span className="w-[36px] shrink-0 text-[9px] font-bold leading-none tracking-[0.12em] text-slate-500">影響力</span>
      <div className="grid h-8 w-[112px] shrink-0 grid-cols-3 gap-1 rounded-full border border-slate-700 bg-slate-800/80 p-1 text-[11px] font-bold text-slate-400">
        {["high", "middle", "low"].map((band) => (
          <button
            key={band}
            type="button"
            className={cx(
              "flex h-6 w-8 items-center justify-center rounded-full transition",
              longPriority === band ? "bg-amber-500 text-slate-950 shadow-sm" : "hover:bg-slate-700 hover:text-white"
            )}
            onClick={() => {
              setLongPriority(band);
              setLongIndex(0);
            }}
          >
            {priorityBands[band]?.label || band}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <CountdownLane
          title="短期"
          slides={shortSlides}
          activeIndex={shortIndex}
          setActiveIndex={setShortIndex}
          showProgressLabel={false}
          showPeakMarker
          showDirectionArrow
          useOrbProgress
        />
        <CountdownLane
          title="中長期"
          slides={longSlides}
          activeIndex={longIndex}
          setActiveIndex={setLongIndex}
          maxSlides={Infinity}
          headerAction={longPriorityControl}
          showProgressLabel={false}
          showPeakMarker
          showDirectionArrow
          useOrbProgress
          departurePrefix="影響下から離脱するまであと"
        />
      </div>
      {developerMode ? (
        <DeveloperBlock title="Count down bar の根拠" meta={developerMeta.countdown} className="bg-slate-50" />
      ) : null}
    </div>
  );
}
function MobileWidgetCard({ title, eyebrow, value, children, onOpen, tone = "dark" }) {
  const toneClass =
    tone === "light"
      ? "border-slate-200 bg-white text-[#0A192F] shadow-[0_14px_34px_rgba(10,25,47,0.10)]"
      : "border-white/10 bg-[#050A17] text-slate-100 shadow-[0_18px_44px_rgba(3,7,18,0.28)]";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        "flex min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-3xl border p-3 text-left transition active:scale-[0.99]",
        toneClass
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[9px] font-black uppercase tracking-[0.18em] opacity-55">{eyebrow}</p>
          <h3 className="mt-1 line-clamp-2 text-sm font-black leading-5">{title}</h3>
        </div>
        {value ? <span className="shrink-0 text-xl font-black leading-none text-[#D4AF37]">{value}</span> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden text-xs leading-5 opacity-80">
        {children}
      </div>
    </button>
  );
}

function mobileForecastSelectedIndex(forecast) {
  const data = Array.isArray(forecast?.yearly_data) ? forecast.yearly_data : [];
  if (!data.length) return 0;
  const preferredDate =
    forecast?.reading_date ||
    forecast?.date ||
    forecast?.meta?.birth_date ||
    new Date().toISOString().slice(0, 10);
  const exactIndex = data.findIndex((day) => day.date === preferredDate);
  if (exactIndex >= 0) return exactIndex;
  return 0;
}

function formatYearlyScore(value) {
  const score = Number(value) || 0;
  if (score > 0) return `+${score}`;
  if (score === 0) return "±0";
  return String(score);
}

function DashboardV2Card({ title, eyebrow, children, className = "", bodyClassName = "" }) {
  return (
    <section className={cx(
      "overflow-hidden rounded-2xl border border-[#e9c349]/22 bg-[#1a1c1c]/54 shadow-[0_0_34px_rgba(0,0,0,0.28)] backdrop-blur-xl transition hover:border-[#e9c349]/45 hover:shadow-[0_0_18px_rgba(233,195,73,0.12)]",
      className
    )}>
      {(eyebrow || title) ? (
        <div className="px-5 pb-2 pt-5">
          {eyebrow ? <p className="font-mono text-[11px] font-black uppercase tracking-[0.28em] text-[#e9c349]">{eyebrow}</p> : null}
          {title ? <h2 className="mt-2 font-notoSerif text-2xl font-semibold leading-tight text-[#f3f3f0]">{title}</h2> : null}
        </div>
      ) : null}
      <div className={cx("p-5", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

function DashboardV2Header({ data, displayDate, activePage = "dashboard", onPageChange = () => {} }) {
  const navItems = [
    { key: "dashboard", label: "Dashboard" },
  ];
  const utilityItems = ["詳細レポート", "History", "My Page", "Plan", "逆行カレンダー"];
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-[#f8fafc]/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-5 py-2 lg:flex-row lg:items-center lg:justify-between lg:px-14">
        <div className="flex min-w-0 flex-wrap items-center gap-6 lg:gap-10">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[#123A63]">
              <Sparkles size={20} />
            </span>
            <p className="font-notoSerif text-2xl font-black tracking-tight text-[#123A63]">
              The Celestial Atelier
            </p>
          </div>
          <nav className="flex items-center gap-6 overflow-x-auto font-mono text-xs font-black text-slate-500">
            {navItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onPageChange(item.key)}
                className={cx(
                  "shrink-0 border-b-2 pb-1 transition",
                  activePage === item.key ? "border-[#D4AF37] text-[#0A192F]" : "border-transparent hover:border-[#D4AF37]/60 hover:text-[#D4AF37]"
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0A192F] transition hover:border-[#D4AF37] hover:text-[#D4AF37]"
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 font-mono text-xs font-black text-[#0A192F]">
            <Clock3 size={15} />
            <span>{displayDate}</span>
          </div>
          <nav className="hidden items-center gap-2 2xl:flex">
            {utilityItems.map((item) => (
              <button
                key={item}
                type="button"
                className="rounded-full border border-slate-200 bg-white px-3 py-2 font-mono text-xs font-bold text-[#0A192F] transition hover:border-[#D4AF37] hover:text-[#D4AF37]"
              >
                {item}
              </button>
            ))}
          </nav>
          <div className="hidden items-center gap-3 pl-1 font-mono text-xs font-black uppercase tracking-[0.18em] text-[#0A192F] sm:flex">
            <span>Profile</span>
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0A192F]">
              <UserCircle2 size={20} />
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

function DashboardV2PersonalCard({ data, displayDate = "", onDateShift = () => {}, isDateLoading = false }) {
  const [personalReadingTab, setPersonalReadingTab] = useState("daily");
  const [selectedHighlightKey, setSelectedHighlightKey] = useState("positive");
  const summaryScrollerRef = React.useRef(null);
  const summaryTrackRef = React.useRef(null);
  const [isSummaryDragging, setIsSummaryDragging] = useState(false);
  const [summaryScrollRatio, setSummaryScrollRatio] = useState(0);
  const activeDisplayDate = displayDate || dashboardDisplayDate(data);
  const dailyStarVibe = String(data.dailyStarVibe || data.daily_star_vibe || "").trim();
  const summaryText = dailyStarVibe || "本日の星模様を表示できません。";
  const aspectHighlights =
    data.aspectHighlights ||
    data.aspect_highlights ||
    {};
  const positiveHighlights = Array.isArray(aspectHighlights.positive) ? aspectHighlights.positive.slice(0, 2) : [];
  const negativeHighlights = Array.isArray(aspectHighlights.negative) ? aspectHighlights.negative.slice(0, 2) : [];
  const highlightGroups = [
    {
      key: "positive",
      label: "追い風",
      items: positiveHighlights,
      className: "border-sky-300/35 bg-sky-300/10 text-sky-200",
      scoreClass: "text-sky-200",
    },
    {
      key: "negative",
      label: "負荷・消耗注意",
      items: negativeHighlights,
      className: "border-rose-300/30 bg-rose-300/10 text-rose-200",
      scoreClass: "text-rose-200",
    },
  ];
  const selectedHighlightGroup = highlightGroups.find((group) => group.key === selectedHighlightKey) || highlightGroups[0];
  const handleSummaryScroll = () => {
    const scroller = summaryScrollerRef.current;
    if (!scroller) return;
    const maxScroll = scroller.scrollHeight - scroller.clientHeight;
    setSummaryScrollRatio(maxScroll > 0 ? scroller.scrollTop / maxScroll : 0);
  };
  const handleSummaryTrackClick = (event) => {
    const scroller = summaryScrollerRef.current;
    if (!scroller) return;
    const maxScroll = scroller.scrollHeight - scroller.clientHeight;
    if (maxScroll <= 0) return;
    const rect = (summaryTrackRef.current || event.currentTarget).getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    scroller.scrollTop = ratio * maxScroll;
    setSummaryScrollRatio(ratio);
  };
  const handleSummaryTrackPointerMove = (event) => {
    if (!isSummaryDragging) return;
    handleSummaryTrackClick(event);
  };
  const handleSummaryTrackPointerUp = (event) => {
    if (!isSummaryDragging) return;
    handleSummaryTrackClick(event);
    setIsSummaryDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };
  return (
    <DashboardV2Card className="h-[330px]" bodyClassName="p-5">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div>
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-notoSerif text-xl font-semibold text-[#e9c349]">今日の洞察</h2>
            </div>
            <div className="mt-2 flex items-center gap-3 font-mono text-[10px] font-black uppercase leading-4 tracking-[0.14em] text-[#909096]">
              <p>Today's Insight</p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onDateShift(-1)}
                  disabled={isDateLoading}
                  aria-label="前の日の洞察を表示"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#e9c349]/45 text-[#e9c349] transition hover:border-[#e9c349] hover:bg-[#e9c349]/10 disabled:cursor-wait disabled:opacity-45"
                >
                  <ChevronLeft size={9} />
                </button>
                <p className={cx("min-w-[6.2rem] text-center", isDateLoading && "text-[#e9c349]")}>{isDateLoading ? "Loading..." : activeDisplayDate}</p>
                <button
                  type="button"
                  onClick={() => onDateShift(1)}
                  disabled={isDateLoading}
                  aria-label="次の日の洞察を表示"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#e9c349]/45 text-[#e9c349] transition hover:border-[#e9c349] hover:bg-[#e9c349]/10 disabled:cursor-wait disabled:opacity-45"
                >
                  <ChevronRight size={9} />
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="text-right text-[#e9c349]">
          <Moon size={34} strokeWidth={1.8} className="ml-auto" />
          <p className="mt-2 font-mono text-xs font-black">Waxing Gibbous</p>
        </div>
      </div>

      <div className="mt-2 flex border-b border-white/10 font-mono text-[11px] font-black">
        {[
          ["daily", "本日の空模様"],
          ["personal", "重要ポイント"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setPersonalReadingTab(value);
              if (value === "personal") setSelectedHighlightKey("positive");
            }}
            className={cx(
              "px-0 pb-2 pr-6 transition",
              personalReadingTab === value ? "border-b-2 border-[#e9c349] text-[#e9c349]" : "text-[#909096] hover:text-[#e2e2e2]"
            )}
          >
            {label}
          </button>
        ))}
        {personalReadingTab === "personal" ? (
          <div className="flex items-start gap-1.5 pb-2 md:gap-2">
            {highlightGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                onClick={() => setSelectedHighlightKey(group.key)}
                className={cx(
                  "shrink-0 whitespace-nowrap rounded-full border px-1.5 py-1 text-[9px] leading-none transition md:px-2.5 md:text-[11px]",
                  selectedHighlightKey === group.key ? group.className : "border-white/10 bg-white/[0.03] text-[#909096] hover:text-[#e2e2e2]"
                )}
              >
                {group.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {personalReadingTab === "daily" ? (
        <div className="flex min-h-[204px] flex-col">
          <div className="mt-4 flex max-h-[122px]">
            <div
              ref={summaryTrackRef}
              className="relative w-1 shrink-0 cursor-pointer overflow-hidden rounded-full bg-[#3c3420]"
              onClick={handleSummaryTrackClick}
              onPointerDown={(event) => {
                setIsSummaryDragging(true);
                event.currentTarget.setPointerCapture?.(event.pointerId);
                handleSummaryTrackClick(event);
              }}
              onPointerMove={handleSummaryTrackPointerMove}
              onPointerUp={handleSummaryTrackPointerUp}
              onPointerCancel={() => setIsSummaryDragging(false)}
              onWheel={(event) => {
                const scroller = summaryScrollerRef.current;
                if (scroller) scroller.scrollTop += event.deltaY;
              }}
              role="presentation"
            >
              <span
                className="absolute left-0 top-0 block w-full rounded-full bg-[#e9c349]/70"
                style={{
                  height: "38%",
                  transform: `translateY(${summaryScrollRatio * 164}%)`,
                }}
              />
            </div>
            <blockquote
              ref={summaryScrollerRef}
              onScroll={handleSummaryScroll}
              className="max-h-[122px] overflow-y-auto pl-5 pr-2 font-notoSerif text-sm font-semibold leading-[1.55] text-[#f3f3f0] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:text-base"
            >
              {summaryText}
            </blockquote>
          </div>

          <div className="mt-auto grid gap-2 pt-3 text-[11px] font-bold leading-5 text-[#e2e2e2]">
            <div className="flex items-start gap-4">
              <Sparkles size={17} className="mt-1 shrink-0 text-[#e9c349]" />
              <span className="line-clamp-1">-</span>
            </div>
            <div className="flex items-start gap-4">
              <Sparkles size={17} className="mt-1 shrink-0 text-[#e9c349]" />
              <span className="line-clamp-1">-</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid max-h-[160px] gap-2 overflow-y-auto pr-1 text-[11px] font-bold leading-5 text-[#e2e2e2] [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin]">
          {selectedHighlightGroup.items.length ? (
            selectedHighlightGroup.items.map((item, index) => {
              const score = Number(item.score || 0);
              return (
                <article key={`${selectedHighlightGroup.key}-${item.label || index}`} className="rounded-lg border border-white/10 bg-[#0d0e0f]/55 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-[11px] font-bold leading-5 text-[#e2e2e2]">
                      {index + 1}. {item.label || "アスペクト"}
                    </p>
                    <span className={cx("shrink-0 text-xs font-black", selectedHighlightGroup.scoreClass)}>
                      {score > 0 ? "+" : ""}
                      {score}
                    </span>
                  </div>
                  {item.description ? <p className="mt-1 text-[11px] font-medium leading-5 text-[#c7c6cc]">{item.description}</p> : null}
                  {item.advisedTask ? <p className="mt-1 border-l border-white/10 pl-2 text-[10px] leading-5 text-[#909096]">{item.advisedTask}</p> : null}
                </article>
              );
            })
          ) : (
            <p className="rounded-lg border border-white/10 bg-[#0d0e0f]/55 p-2 text-[11px] leading-5 text-[#909096]">
              {selectedHighlightGroup.key === "positive" ? "追い風に該当するアスペクトなし" : "負荷・消耗注意に該当するアスペクトなし"}
            </p>
          )}
        </div>
      )}
    </DashboardV2Card>
  );
}

function formatPressureDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function pressurePeriodLabel(slide, baseDateKey = "") {
  const explicitStart = dateKeyToLocalDate(slide?.impact_start_date || slide?.impactStartDate || slide?.scan?.impact_start_date);
  const explicitEnd = dateKeyToLocalDate(slide?.impact_end_date || slide?.impactEndDate || slide?.scan?.impact_end_date);
  if (explicitStart && explicitEnd) {
    const startSuffix = slide?.impact_start_is_before || slide?.impactStartIsBefore || slide?.scan?.impact_start_is_before ? "以前" : "";
    const endSuffix = slide?.impact_end_is_after || slide?.impactEndIsAfter || slide?.scan?.impact_end_is_after ? "以降" : "頃";
    return `${formatPressureDate(explicitStart)}${startSuffix}〜${formatPressureDate(explicitEnd)}${endSuffix}`;
  }
  const days = countdownDaysUntil(slide, baseDateKey);
  if (!Number.isFinite(days)) return "";
  const baseDate = dateKeyToLocalDate(baseDateKey) || new Date();
  const totalDays = Number(slide?.total_days ?? slide?.totalDays ?? slide?.scan?.total_days ?? 0);
  if (!Number.isFinite(totalDays) || totalDays <= 0) return "";
  const exitDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + Math.max(0, days));
  const startOffset = Number.isFinite(totalDays) && totalDays > 0 ? Math.max(0, days - totalDays) : 0;
  const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + startOffset);
  const startLabel = formatPressureDate(startDate);
  const exitLabel = formatPressureDate(exitDate);
  return startLabel && exitLabel ? `${startLabel}〜${exitLabel}頃` : "";
}

function PressureCountdownList({
  items = [],
  baseDateKey = "",
  summary = null,
  emptyMessage = "強い負荷アスペクトはありません。",
  countdownLabel = "抜けるまで",
  showInfluencePeriod = true,
  aspectFallbackLabel = "Pressure Aspect",
  differentiateDeparture = false,
}) {
  const visibleItems = Array.isArray(items) ? items : [];
  const groupSummaries = summary?.groups && typeof summary.groups === "object" ? summary.groups : {};
  const overallComment = String(summary?.overallComment || summary?.overall_comment || "").trim();
  const summaryBlock = overallComment || Object.keys(groupSummaries).length ? (
    <article className="rounded-lg border border-[#e9c349]/25 bg-[#e9c349]/10 p-3">
      <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-[#e9c349]">
        Pressure Load
      </p>
      {overallComment ? (
        <p className="mt-2 text-[11px] font-bold leading-5 text-[#f3e5ae]">
          {overallComment}
        </p>
      ) : null}
      {Object.keys(groupSummaries).length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {["short", "long"].map((key) => {
            const group = groupSummaries[key];
            if (!group) return null;
            const score = Number(group.loadScore ?? group.load_score);
            return (
              <div key={key} className="rounded border border-white/10 bg-black/10 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black text-[#e9c349]">{group.label || key}</span>
                  {Number.isFinite(score) ? <span className="font-mono text-[10px] text-[#c7c6cc]">負荷 {score}</span> : null}
                </div>
                {group.comment ? <p className="mt-1 text-[10px] font-bold leading-4 text-[#c7c6cc]">{group.comment}</p> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  ) : null;
  if (!visibleItems.length) {
    return (
      <div className="mt-5 grid min-h-0 flex-1 gap-3 overflow-y-auto pr-2 [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin]">
        {summaryBlock}
        <div className="flex min-h-[10rem] items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] p-5 text-center text-sm font-bold leading-7 text-[#c7c6cc]">
          {emptyMessage}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-5 grid min-h-0 flex-1 gap-3 overflow-y-auto pr-2 [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin]">
      {summaryBlock}
      {visibleItems.map((item, index) => {
        const remaining = countdownRemainingValue(item, baseDateKey);
        const isDeparture = isDepartureCountdown(item);
        const useDepartureColors = differentiateDeparture && isDeparture;
        const aspectLabel = item.aspect_label || "";
        const timelineAdvise = String(item.timelineAdvise || item.timeline_advise || item.target?.timeline_advise || "").trim();
        const orbValue = Number(item.current_orb ?? item.currentOrb ?? item.scan?.current_orb);
        const periodLabel = showInfluencePeriod ? pressurePeriodLabel(item, baseDateKey) : "";
        return (
          <article
            key={`${countdownSlideKey(item)}-${index}`}
            className={cx(
              "rounded-lg border p-3",
              useDepartureColors
                ? "border-sky-300/20 bg-sky-950/20"
                : "border-rose-200/15 bg-rose-950/15"
            )}
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                {periodLabel ? (
                  <p className={cx(
                    "mb-1 inline-flex max-w-full items-center rounded border px-2 py-1 text-[10px] font-bold leading-none",
                    useDepartureColors
                      ? "border-sky-300/25 bg-sky-300/10 text-sky-200/80"
                      : "border-[#e9c349]/35 bg-[#e9c349]/10 text-[#e7d38b]"
                  )}>
                    {periodLabel}
                  </p>
                ) : null}
                <p className={cx(
                  "whitespace-nowrap text-[8px] font-black leading-4 tracking-[-0.01em] sm:text-[9px]",
                  useDepartureColors ? "text-sky-300" : "text-[#e9c349]"
                )}>
                  {aspectLabel || aspectFallbackLabel}
                  {Number.isFinite(orbValue) ? ` / orb ${orbValue.toFixed(2)}°` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={cx(
                  "mt-1 text-[10px] font-bold",
                  useDepartureColors ? "text-sky-200/65" : "text-[#909096]"
                )}>
                  {isDeparture ? "抜けるまで" : countdownLabel}
                </p>
                <p className={cx(
                  "mt-1 font-mono text-xl font-black leading-none",
                  useDepartureColors ? "text-sky-300" : "text-[#e9c349]"
                )}>
                  {Number.isFinite(remaining.value) ? `${remaining.value}${remaining.unit}` : "-"}
                </p>
              </div>
            </div>
            {timelineAdvise ? (
              <p className="mt-2 whitespace-pre-line text-[11px] font-bold leading-5 text-[#c7c6cc]">
                {timelineAdvise}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function DashboardV2DailyThemeCard({ data, displayDate = "", onDateShift = () => {}, isDateLoading = false, focusedAspect = null }) {
  const [analysisMode, setAnalysisMode] = useState("theme");
  const activeDisplayDate = displayDate || dashboardDisplayDate(data);
  const dailyStarVibe = String(data.dailyStarVibe || data.daily_star_vibe || "").trim();
  const summaryText = dailyStarVibe || "本日の星模様を表示できません。";
  const aspectHighlights =
    data.aspectHighlights ||
    data.aspect_highlights ||
    {};
  const positiveHighlights = Array.isArray(aspectHighlights.positive) ? aspectHighlights.positive : [];
  const negativeHighlights = Array.isArray(aspectHighlights.negative) ? aspectHighlights.negative : [];
  const countdownGroups = data.countdown_groups || {};
  const pressureItems = React.useMemo(
    () => pressureCountdownItems(data, countdownGroups, activeDisplayDate),
    [data, countdownGroups, activeDisplayDate]
  );
  const reliefItems = React.useMemo(
    () => reliefCountdownItems(data, countdownGroups, activeDisplayDate),
    [data, countdownGroups, activeDisplayDate]
  );
  const pressureLoadSummary = data.pressure_load_summary || data.pressureLoadSummary || null;
  const yearlyForecast = data.yearly_forecast || data.yearlyForecast || null;
  const monthlyOverview = React.useMemo(
    () => monthlyOverviewForDate(yearlyForecast, activeDisplayDate),
    [yearlyForecast, activeDisplayDate]
  );
  const isMonthlyOverviewLoading = Boolean(
    data.monthly_overview_loading || data.monthlyOverviewLoading
  );
  const focusedAspectKey = focusedAspect?.key || "";
  const focusedAspectToken = focusedAspect?.token || 0;
  useEffect(() => {
    if (focusedAspectKey) {
      setAnalysisMode("test1");
    }
  }, [focusedAspectKey, focusedAspectToken]);
  const analysisTitle = {
    theme: "今日の星の流れ",
    lesson: "今日の追い風",
    summary: "今日の消耗注意",
    test1: "負荷が抜けるまで",
    relief: "追い風が届くまで",
    monthly: "今月の運気",
  }[analysisMode] || "今日の星の流れ";
  const timelineItems = (items, fallbackBody, color) => (
    <div className="mt-6 grid min-h-0 flex-1 gap-6 overflow-y-auto pr-2 [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin] sm:mt-8 sm:gap-8">
      {(items.length ? items : [{ label: activeDisplayDate || "TODAY", description: fallbackBody }]).map((item, index) => (
        <article key={`${item.label || "daily"}-${index}`} className="relative pl-8">
          <span className="absolute left-0 top-0.5 h-3 w-3 rounded-full shadow-[0_0_18px_currentColor]" style={{ color, backgroundColor: color }} />
          <span className="absolute left-[5px] top-4 h-full w-px bg-white/15" />
          <p className="font-mono text-xs font-bold uppercase tracking-[0.12em]" style={{ color }}>
            {item.label || activeDisplayDate || "TODAY"}
          </p>
          <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#c7c6cc] sm:text-base sm:leading-8">
            {item.description || item.advisedTask || fallbackBody}
          </p>
        </article>
      ))}
    </div>
  );

  return (
    <DashboardV2Card className="h-[520px] sm:h-[560px] lg:h-[620px]" bodyClassName="flex h-full flex-col p-2 sm:p-5 lg:p-6">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-[#e9c349]/75 sm:text-[9px]">
            Main Theme
          </p>
          <div className="mt-1 flex items-center gap-3">
            <h2 className="font-notoSerif text-2xl font-semibold text-[#f3f3f0] sm:text-3xl">
              {analysisTitle}
            </h2>
            <Moon size={30} strokeWidth={1.8} className="shrink-0 text-[#e9c349]" />
          </div>
          <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-[#909096]">
            <button
              type="button"
              onClick={() => onDateShift(-1)}
              disabled={isDateLoading}
              aria-label="前の日の星の流れを表示"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#e9c349]/45 text-[#e9c349] transition hover:border-[#e9c349] hover:bg-[#e9c349]/10 disabled:cursor-wait disabled:opacity-45"
            >
              <ChevronLeft size={9} />
            </button>
            <p className={cx("min-w-[6.2rem] text-center", isDateLoading && "text-[#e9c349]")}>
              {isDateLoading ? "Loading..." : activeDisplayDate}
            </p>
            <button
              type="button"
              onClick={() => onDateShift(1)}
              disabled={isDateLoading}
              aria-label="次の日の星の流れを表示"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#e9c349]/45 text-[#e9c349] transition hover:border-[#e9c349] hover:bg-[#e9c349]/10 disabled:cursor-wait disabled:opacity-45"
            >
              <ChevronRight size={9} />
            </button>
          </div>
        </div>
        <div className="flex w-full overflow-x-auto rounded-full border border-white/10 bg-white/[0.04] p-0.5 font-mono text-[7px] font-bold text-[#909096] [scrollbar-width:none] sm:w-auto sm:shrink-0 sm:p-1 sm:text-[10px]">
          {[
            ["theme", "星の流れ"],
            ["lesson", "追い風"],
            ["summary", "消耗注意"],
            ["test1", "負荷が抜ける\nまで"],
            ["relief", "追い風が届く\nまで"],
            ["monthly", "今月の運気"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setAnalysisMode(value)}
              className={cx(
                "shrink-0 rounded-full px-1 py-1.5 transition sm:px-3",
                analysisMode === value ? "bg-[#e9c349] text-[#241a00]" : "hover:bg-white/10 hover:text-[#f3f3f0]"
              )}
            >
              {String(label).split("\n").map((line) => (
                <span key={line} className="block leading-tight">
                  {line}
                </span>
              ))}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 h-px bg-white/10 sm:mt-5" />
      {analysisMode === "theme" ? timelineItems([], summaryText, "#e9c349") : null}
      {analysisMode === "lesson" ? timelineItems(positiveHighlights, "追い風に該当するアスペクトなし", "#38bdf8") : null}
      {analysisMode === "summary" ? timelineItems(negativeHighlights, "負荷・消耗注意に該当するアスペクトなし", "#fecdd3") : null}
      {analysisMode === "test1" ? <PressureCountdownList items={pressureItems} baseDateKey={activeDisplayDate} summary={pressureLoadSummary} /> : null}
      {analysisMode === "relief" ? (
        <PressureCountdownList
          items={reliefItems}
          baseDateKey={activeDisplayDate}
          summary={null}
          emptyMessage="Score Impact +25以上のアスペクトはありません。"
          countdownLabel="届くまで"
          showInfluencePeriod
          aspectFallbackLabel="Support Aspect"
          differentiateDeparture
        />
      ) : null}
      {analysisMode === "monthly" ? (
        monthlyOverview ? (
          <MonthlyOverviewContent overview={monthlyOverview} />
        ) : (
          timelineItems(
            [],
            isMonthlyOverviewLoading
              ? "今月の運気を読み込んでいます..."
              : "この月の運気は準備中です。",
            "#e9c349"
          )
        )
      ) : null}
    </DashboardV2Card>
  );
}

function DashboardV2CountdownCard({ data, onSelectAspect = () => {} }) {
  const [activeEventIndex, setActiveEventIndex] = useState(0);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarFilter, setCalendarFilter] = useState("all");
  const [personalGenreFilter, setPersonalGenreFilter] = useState("all");
  const displayDate = dashboardDisplayDate(data);
  const calendarItems = React.useMemo(() => {
    const rawItems = (Array.isArray(data.celestial_event_calendar) ? data.celestial_event_calendar : []).filter((item) => {
      if (!item) return false;
      const daysUntil = countdownDaysUntil(item, displayDate);
      return daysUntil !== null && daysUntil >= 0 && daysUntil <= 30;
    });
    const seen = new Set();
    return rawItems.filter((item) => {
      const key = countdownSlideKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data.celestial_event_calendar, displayDate]);
  const candidates = React.useMemo(() => {
    let hasUpcomingMoonIngress = false;
    let hasUpcomingLunation = false;
    const houseIngressPlanets = new Set();
    return calendarItems.filter((item) => {
      if (item.event_type === "transit_natal_aspect") {
        if (isTransitMoonAspect(item) || Number(item.aspect_angle) === 90) return false;
      }
      const isMoonIngress = item.event_type === "sign_ingress" && String(item.transit_planet || item.planet || "").toUpperCase() === "MOON";
      if (isMoonIngress) {
        if (hasUpcomingMoonIngress) return false;
        hasUpcomingMoonIngress = true;
        return true;
      }
      const isLunation = item.event_type === "new_moon" || item.event_type === "full_moon";
      if (isLunation) {
        if (hasUpcomingLunation) return false;
        hasUpcomingLunation = true;
      }
      if (item.event_type === "natal_house_ingress") {
        const transitPlanet = String(item.transit_planet || item.planet || "").toUpperCase();
        if (houseIngressPlanets.has(transitPlanet)) return false;
        houseIngressPlanets.add(transitPlanet);
      }
      return true;
    });
  }, [calendarItems]);
  const eventCount = candidates.length;
  const candidateKeys = candidates.map((item) => countdownSlideKey(item)).join("|");
  useEffect(() => {
    setActiveEventIndex(0);
  }, [candidateKeys]);
  useEffect(() => {
    if (!isCalendarOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsCalendarOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isCalendarOpen]);
  const goToEvent = (direction) => {
    if (eventCount <= 1) return;
    setActiveEventIndex((index) => (index + direction + eventCount) % eventCount);
  };
  const visibleEventIndex = Math.min(activeEventIndex, Math.max(0, eventCount - 1));
  const slide = candidates[visibleEventIndex] || {};
  const days = countdownDaysUntil(slide, displayDate);
  const remaining = countdownRemainingValue(slide, displayDate);
  const hasEvent = eventCount > 0;
  const hasLinkedWeeklyAspect = false;
  const title = hasEvent ? (slide.title || "カウントダウン") : "30日以内のイベントはありません";
  const handleSelectEvent = () => {
    if (!hasEvent || !hasLinkedWeeklyAspect) return;
    onSelectAspect(aspectFocusKey(slide));
  };
  const celestialEventTypeMeta = {
    sign_ingress: { label: "サイン移動", group: "celestial" },
    retrograde_start: { label: "逆行開始", group: "celestial" },
    direct_start: { label: "順行復帰", group: "celestial" },
    new_moon: { label: "新月", group: "celestial" },
    full_moon: { label: "満月", group: "celestial" },
    natal_house_ingress: { label: "ハウス移動", group: "personal" },
    transit_natal_aspect: { label: "個人アスペクト", group: "personal" },
  };
  const filteredCalendarItems = calendarItems.filter((item) => {
    if (calendarFilter === "all") return true;
    if (celestialEventTypeMeta[item.event_type]?.group !== calendarFilter) return false;
    if (calendarFilter !== "personal" || personalGenreFilter === "all") return true;
    const genres = Array.isArray(item.genres) && item.genres.length
      ? item.genres.map((genre) => String(genre))
      : [String(item.genre || "general")];
    return genres.includes(personalGenreFilter);
  });
  const calendarGroups = filteredCalendarItems.reduce((groupsByDate, item) => {
    const dateKey = item.event_date || "日付未設定";
    if (!groupsByDate[dateKey]) groupsByDate[dateKey] = [];
    groupsByDate[dateKey].push(item);
    return groupsByDate;
  }, {});
  const formatEventDateHeading = (value) => {
    const date = dateKeyToLocalDate(value);
    if (!date) return value;
    return `${date.getMonth() + 1}月${date.getDate()}日（${["日", "月", "火", "水", "木", "金", "土"][date.getDay()]}）`;
  };
  const formatEventTime = (value) => {
    const match = String(value || "").match(/T(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : "--:--";
  };
  return (
    <>
    <DashboardV2Card className="h-[185px]" bodyClassName="p-5">
      <div
        className="flex h-full w-full flex-col justify-between text-left"
      >
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="font-mono text-xs font-black uppercase tracking-[0.28em] text-[#e9c349]">Next Stellar Event</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCalendarOpen(true)}
                disabled={!eventCount}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[#e9c349]/35 px-2.5 font-mono text-[9px] font-black text-[#e9c349] transition hover:border-[#e9c349] hover:bg-[#e9c349]/10 disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="天体イベントカレンダーを開く"
              >
                <CalendarDays size={13} />
                <span className="hidden sm:inline">30 DAYS</span>
              </button>
              {eventCount > 1 ? (
                <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    goToEvent(-1);
                  }}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#e9c349]/35 text-[#e9c349] transition hover:border-[#e9c349] hover:bg-[#e9c349]/10"
                  aria-label="前のステラーイベント"
                  title="前へ"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="min-w-[34px] text-center font-mono text-[10px] font-black text-[#909096]">
                  {visibleEventIndex + 1}/{eventCount}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    goToEvent(1);
                  }}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#e9c349]/35 text-[#e9c349] transition hover:border-[#e9c349] hover:bg-[#e9c349]/10"
                  aria-label="次のステラーイベント"
                  title="次へ"
                >
                  <ChevronRight size={15} />
                </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-4">
            <div>
              <p className="line-clamp-2 font-notoSerif text-lg font-black leading-tight text-[#f3f3f0]">{title}</p>
              {hasLinkedWeeklyAspect ? (
                <button
                  type="button"
                  onClick={handleSelectEvent}
                  className="mt-1 text-xs font-bold text-[#c7c6cc] transition hover:text-[#e9c349] focus:outline-none focus:ring-2 focus:ring-[#e9c349]/35"
                  aria-label="対応するカウントダウン1のアスペクトへ移動"
                >
                  {">>Click"}
                </button>
              ) : (
                <p className="mt-1 text-xs text-[#c7c6cc]">...Coming soon</p>
              )}
            </div>
            <p className="font-mono text-xl font-black leading-none text-[#e9c349]">
              {hasEvent && Number.isFinite(remaining.value) ? `${remaining.value}${remaining.unit}` : "-"}
            </p>
          </div>
        </div>
        <div className="mt-4 h-px bg-[#e9c349]/25" />
        <p className="mt-2 line-clamp-1 text-[11px] font-bold leading-5 text-[#e2e2e2]">
          {hasEvent ? (slide.note || "次の天体イベントに備えます。") : "直近30日以内に表示対象のステラーイベントはありません。"}
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-[#e9c349]" style={{ width: hasEvent ? `${Math.max(8, Math.min(100, 100 - Math.max(0, Number(days) || 0) * 8))}%` : "0%" }} />
        </div>
      </div>
    </DashboardV2Card>
    {isCalendarOpen && typeof document !== "undefined" ? createPortal(
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-[#050607]/80 px-3 py-5 backdrop-blur-md sm:px-6"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsCalendarOpen(false);
        }}
      >
        <section
          className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-[#e9c349]/25 bg-[#111313] text-[#e2e2e2] shadow-[0_30px_100px_rgba(0,0,0,0.7)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="celestial-event-calendar-title"
        >
          <header className="shrink-0 border-b border-white/10 px-4 py-4 sm:px-6 sm:py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.28em] text-[#e9c349]">Celestial Event Calendar</p>
                <h2 id="celestial-event-calendar-title" className="mt-1 font-notoSerif text-xl font-black text-[#f3f3f0] sm:text-2xl">天体イベントカレンダー</h2>
                <p className="mt-1 text-[11px] text-[#909096]">現在日時から30日以内に発生するイベント / {calendarItems.length}件</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCalendarOpen(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-[#c7c6cc] transition hover:border-[#e9c349]/60 hover:text-[#e9c349]"
                aria-label="天体イベントカレンダーを閉じる"
              >
                <X size={17} />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ["all", "すべて"],
                ["celestial", "天体現象"],
                ["personal", "個人イベント"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCalendarFilter(value)}
                  className={cx(
                    "rounded-full border px-3 py-1.5 text-[10px] font-black transition",
                    calendarFilter === value
                      ? "border-[#e9c349] bg-[#e9c349] text-[#241a00]"
                      : "border-white/10 bg-white/[0.04] text-[#909096] hover:border-white/25 hover:text-[#f3f3f0]"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {calendarFilter === "personal" ? (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-3">
                <span className="mr-1 font-mono text-[8px] font-black uppercase tracking-[0.18em] text-[#6f7075]">Genre</span>
                {[
                  ["all", "すべて"],
                  ["love", "恋愛・対人"],
                  ["general", "全般"],
                  ["money", "金運"],
                  ["work", "仕事"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPersonalGenreFilter(value)}
                    className={cx(
                      "rounded-full border px-2.5 py-1 text-[9px] font-black transition",
                      personalGenreFilter === value
                        ? "border-[#38bdf8]/70 bg-[#38bdf8]/15 text-[#7dd3fc]"
                        : "border-white/10 bg-white/[0.025] text-[#77787d] hover:border-white/20 hover:text-[#c7c6cc]"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-color:#e9c34933_transparent] sm:px-6">
            {Object.keys(calendarGroups).length ? (
              <div className="grid gap-5">
                {Object.entries(calendarGroups).map(([dateKey, items]) => (
                  <section key={dateKey} className="grid gap-2 sm:grid-cols-[132px_1fr] sm:gap-4">
                    <div className="sm:sticky sm:top-0 sm:self-start">
                      <p className="font-mono text-xs font-black text-[#e9c349]">{formatEventDateHeading(dateKey)}</p>
                      <p className="mt-1 font-mono text-[9px] text-[#6f7075]">{items.length} EVENTS</p>
                    </div>
                    <div className="grid gap-2">
                      {items.map((item) => {
                        const typeMeta = celestialEventTypeMeta[item.event_type] || { label: item.event_type || "Event" };
                        const isCaution = item.classification === "caution";
                        return (
                          <article
                            key={item.event_id}
                            className={cx(
                              "grid gap-2 rounded-2xl border bg-white/[0.035] px-3 py-3 sm:grid-cols-[54px_1fr] sm:px-4",
                              isCaution ? "border-[#ff5c68]/22" : "border-white/10"
                            )}
                          >
                            <p className={cx("font-mono text-xs font-black", isCaution ? "text-[#ff8b94]" : "text-[#e9c349]")}>{formatEventTime(item.event_datetime)}</p>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-notoSerif text-sm font-black text-[#f3f3f0]">{item.title}</h3>
                                <span className={cx(
                                  "rounded-full border px-2 py-0.5 font-mono text-[8px] font-black",
                                  isCaution
                                    ? "border-[#ff5c68]/30 bg-[#ff5c68]/10 text-[#ff9aa3]"
                                    : "border-[#38bdf8]/25 bg-[#38bdf8]/10 text-[#7dd3fc]"
                                )}>{typeMeta.label}</span>
                              </div>
                              <p className="mt-1 text-[10px] leading-5 text-[#909096]">{item.note}</p>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-sm text-[#909096]">該当するイベントはありません。</div>
            )}
          </div>
        </section>
      </div>,
      document.body
    ) : null}
    </>
  );
}

const DAILY_ASPECT_PLANET_LABELS = {
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
const DAILY_PERFORMANCE_TOTAL_HOURS = 72;
const DAILY_PERFORMANCE_SAMPLE_STEP_HOURS = 3;
const DAILY_PERFORMANCE_AXIS_STEP_HOURS = 6;
const DAILY_ASPECT_TOOLTIP_WIDTH = 320;
const DAILY_ASPECT_TOOLTIP_HEIGHT = 180;
const DAILY_ASPECT_TOOLTIP_GAP = 12;
const DAILY_PERFORMANCE_SAMPLE_HOURS = Array.from(
  { length: DAILY_PERFORMANCE_TOTAL_HOURS / DAILY_PERFORMANCE_SAMPLE_STEP_HOURS + 1 },
  (_, index) => index * DAILY_PERFORMANCE_SAMPLE_STEP_HOURS
);
const DAILY_PERFORMANCE_AXIS_HOURS = Array.from(
  { length: DAILY_PERFORMANCE_TOTAL_HOURS / DAILY_PERFORMANCE_AXIS_STEP_HOURS + 1 },
  (_, index) => index * DAILY_PERFORMANCE_AXIS_STEP_HOURS
);

function clampDailyTooltipValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dailyAspectTooltipPosition(event) {
  if (typeof window === "undefined") {
    return {
      left: DAILY_ASPECT_TOOLTIP_GAP,
      top: DAILY_ASPECT_TOOLTIP_GAP,
      width: DAILY_ASPECT_TOOLTIP_WIDTH,
      height: DAILY_ASPECT_TOOLTIP_HEIGHT,
    };
  }

  const rect = event.currentTarget.getBoundingClientRect();
  const anchorX = event.clientX || rect.left + rect.width / 2;
  const anchorY = event.clientY || rect.top + rect.height / 2;
  const width = Math.min(DAILY_ASPECT_TOOLTIP_WIDTH, Math.max(240, window.innerWidth - DAILY_ASPECT_TOOLTIP_GAP * 2));
  const height = Math.min(DAILY_ASPECT_TOOLTIP_HEIGHT, Math.max(140, window.innerHeight - DAILY_ASPECT_TOOLTIP_GAP * 2));
  let left = anchorX + DAILY_ASPECT_TOOLTIP_GAP;
  if (left + width > window.innerWidth - DAILY_ASPECT_TOOLTIP_GAP) {
    left = anchorX - width - DAILY_ASPECT_TOOLTIP_GAP;
  }
  let top = anchorY - height - DAILY_ASPECT_TOOLTIP_GAP;
  if (top < DAILY_ASPECT_TOOLTIP_GAP) {
    top = anchorY + DAILY_ASPECT_TOOLTIP_GAP;
  }

  return {
    left: clampDailyTooltipValue(left, DAILY_ASPECT_TOOLTIP_GAP, window.innerWidth - width - DAILY_ASPECT_TOOLTIP_GAP),
    top: clampDailyTooltipValue(top, DAILY_ASPECT_TOOLTIP_GAP, window.innerHeight - height - DAILY_ASPECT_TOOLTIP_GAP),
    width,
    height,
  };
}

function dailyAspectHour(point, index = 0) {
  const hour = Number(point?.hour);
  if (Number.isFinite(hour)) return Math.max(0, Math.min(DAILY_PERFORMANCE_TOTAL_HOURS, hour));
  const parsed = Number(String(point?.time || "").slice(0, 2));
  if (Number.isFinite(parsed)) {
    const dayOffset = Number(point?.dayOffset ?? point?.day_offset ?? 0);
    const cumulativeHour = parsed + (Number.isFinite(dayOffset) ? dayOffset * 24 : 0);
    return Math.max(0, Math.min(DAILY_PERFORMANCE_TOTAL_HOURS, cumulativeHour));
  }
  return Math.max(0, Math.min(DAILY_PERFORMANCE_TOTAL_HOURS, index * DAILY_PERFORMANCE_SAMPLE_STEP_HOURS));
}

function dailyPerformanceTimeLabel(point, index = 0, baseDate = "") {
  const hour = dailyAspectHour(point, index);
  const dayOffset = Math.floor(hour / 24);
  const clockHour = hour % 24;
  const clockLabel = `${String(clockHour).padStart(2, "0")}:00`;
  if (dayOffset > 0) {
    const date = formatIsoDate(point?.date) || formatIsoDate(addDaysToIsoDate(baseDate, dayOffset));
    const [, month = "", day = ""] = date.match(/^\d{4}-(\d{2})-(\d{2})$/) || [];
    return month && day ? `${Number(month)}/${Number(day)} ${clockLabel}` : clockLabel;
  }
  return clockLabel;
}

function dailyPerformanceAxisTick(baseDate, hour) {
  const clockHour = hour % 24;
  const date = clockHour === 0 ? formatIsoDate(addDaysToIsoDate(baseDate, hour / 24)) : "";
  const [, month = "", day = ""] = date.match(/^\d{4}-(\d{2})-(\d{2})$/) || [];
  return {
    hour,
    time: `${String(clockHour).padStart(2, "0")}:00`,
    dateLabel: date ? `${Number(month)}/${Number(day)}` : "",
    left: (hour / DAILY_PERFORMANCE_TOTAL_HOURS) * 100,
  };
}

function dailyAspectStrength(aspect = {}) {
  const impact = Math.abs(Number(aspect.scoreImpact ?? aspect.score_impact ?? 0));
  const orb = Number(aspect.orb ?? 5);
  const dignity = Math.abs(Number(aspect.essentialDignityScore ?? aspect.essential_dignity_score ?? 0));
  const orbBoost = Number.isFinite(orb) ? Math.max(0, 5 - orb) * 8 : 0;
  return impact + orbBoost + dignity * 0.2;
}

function dailyAspectLabel(aspect = {}) {
  const transitPlanetKey = String(aspect.t_planet || aspect.tPlanet || "").toUpperCase();
  const natalPlanetKey = String(aspect.n_planet || aspect.nPlanet || "").toUpperCase();
  const transitPlanet = DAILY_ASPECT_PLANET_LABELS[transitPlanetKey] || transitPlanetKey || "Transit";
  const natalPlanet = DAILY_ASPECT_PLANET_LABELS[natalPlanetKey] || natalPlanetKey || "Natal";
  const angle = Number(aspect.angle);
  const angleLabel = Number.isFinite(angle) ? `${angle}°` : "";
  return `ネイタル${natalPlanet} × トランジット${transitPlanet}${angleLabel ? ` ${angleLabel}` : ""}`;
}

function dailyAspectBarLabel(aspect = {}) {
  const transitPlanetKey = String(aspect.t_planet || aspect.tPlanet || "").toUpperCase();
  const natalPlanetKey = String(aspect.n_planet || aspect.nPlanet || "").toUpperCase();
  const transitPlanet = DAILY_ASPECT_PLANET_LABELS[transitPlanetKey] || transitPlanetKey || "T";
  const natalPlanet = DAILY_ASPECT_PLANET_LABELS[natalPlanetKey] || natalPlanetKey || "N";
  const angle = Number(aspect.angle);
  const angleLabel = Number.isFinite(angle) ? `${angle}°` : "";
  return `N${natalPlanet} × T${transitPlanet}${angleLabel ? ` ${angleLabel}` : ""}`;
}

function dailyAspectDetail(aspect = {}, strength = 0) {
  return {
    label: dailyAspectLabel(aspect),
    score: Number(aspect.scoreImpact ?? aspect.score_impact ?? 0),
    impact: Math.abs(Number(aspect.scoreImpact ?? aspect.score_impact ?? 0)),
    priority: Number(aspect.priority ?? 0),
    orb: Number(aspect.orb),
    orbStatus: String(aspect.orbStatus ?? aspect.orb_status ?? "").trim(),
    category: String(aspect.category || "").trim(),
    description: String(aspect.description || "").trim(),
    advisedTask: String(aspect.advisedTask || aspect.advised_task || aspect.recommendedAction || "").trim(),
    strength,
  };
}

const DAILY_TIMELINE_DEFAULT_LIMIT = 15;
const DAILY_TIMELINE_COLORS = {
  positive: "#34d399",
  negative: "#ff5c68",
  neutral: "#a78bfa",
};
const DAILY_PERFORMANCE_METRIC_LABELS = {
  MARS_ACTIVITY: "行動エネルギー",
  DRIVE: "集中力",
  FLOW: "同調性",
  INSPIRATION: "ひらめき",
  FRICTION: "焦り・摩擦",
};
const DAILY_PERFORMANCE_MARS_STATE_LABELS = {
  HIGH: "高",
  LOW: "低",
  NEUTRAL: "中",
};
const DAILY_PERFORMANCE_FRICTION_STATE_LABELS = {
  SPIKE: "強警戒",
  HIGH: "高",
  LOW: "低",
  NEUTRAL: "中",
};

function dailyPerformanceActionAdvice(point = {}) {
  if (!point) return null;
  const advice = point.actionAdvice || point.action_advice || null;
  if (advice && typeof advice === "object") return advice;
  return null;
}

function dailyTimelineAspectCandidates(point = {}) {
  if (Array.isArray(point.timelineAspects)) return point.timelineAspects;
  if (Array.isArray(point.timeline_aspects)) return point.timeline_aspects;

  const legacyAspects = [
    ...(Array.isArray(point.moonAspects) ? point.moonAspects : []),
    ...(Array.isArray(point.mercuryAspects) ? point.mercuryAspects : []),
    ...(Array.isArray(point.venusAspects) ? point.venusAspects : []),
  ];
  if (legacyAspects.length) return legacyAspects;
  return Array.isArray(point.sourceAspects)
    ? point.sourceAspects
    : Array.isArray(point.source_aspects)
      ? point.source_aspects
      : [];
}

function rangesOverlap(a, b) {
  return a.start < b.end && b.start < a.end;
}

function dailyTimelinePolarity(detail = {}) {
  const impact = Number(detail.score ?? 0);
  if (impact > 0) return "positive";
  if (impact < 0) return "negative";
  return "neutral";
}

function dailyAspectOrbOpacity(orbValue, peakOrbValue) {
  const orb = Number(orbValue);
  const peakOrb = Number(peakOrbValue);
  if (!Number.isFinite(orb) || !Number.isFinite(peakOrb)) return 0.18;
  const distanceFromPeak = Math.max(0, orb - peakOrb);
  const fadeRatio = Math.min(1, distanceFromPeak / 5);
  return 0.18 + ((1 - fadeRatio) * 0.74);
}

function dailyTimelineColorWithOpacity(color, opacity) {
  const hex = String(color || "").replace("#", "");
  const normalized = hex.length === 3
    ? hex.split("").map((value) => `${value}${value}`).join("")
    : hex;
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return color;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const alpha = Math.max(0, Math.min(1, Number(opacity) || 0));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function dailyTimelineAspectGradient(color, opacityStops = []) {
  if (!opacityStops.length) return dailyTimelineColorWithOpacity(color, 0.18);
  if (opacityStops.length === 1) return dailyTimelineColorWithOpacity(color, opacityStops[0].opacity);
  const gradientStops = [
    { offset: 0, opacity: opacityStops[0].opacity },
    ...opacityStops,
    { offset: 100, opacity: opacityStops[opacityStops.length - 1].opacity },
  ];
  return `linear-gradient(90deg, ${gradientStops
    .map((stop) => `${dailyTimelineColorWithOpacity(color, stop.opacity)} ${Math.max(0, Math.min(100, stop.offset))}%`)
    .join(", ")})`;
}

function buildDailyTimelineAspectBlocks(chartPerformance = []) {
  const aspectMap = new Map();
  chartPerformance.forEach((point, pointIndex) => {
    const hour = dailyAspectHour(point, pointIndex);
    dailyTimelineAspectCandidates(point).forEach((aspect) => {
      const tPlanet = String(aspect.t_planet || aspect.tPlanet || "").toUpperCase();
      const nPlanet = String(aspect.n_planet || aspect.nPlanet || "").toUpperCase();
      const angle = Number(aspect.angle);
      const key = `${tPlanet}-${nPlanet}-${Number.isFinite(angle) ? angle : "x"}-${aspect.category || ""}`;
      const strength = dailyAspectStrength(aspect);
      const detail = dailyAspectDetail(aspect, strength);
      const priority = Number.isFinite(detail.priority) ? detail.priority : 0;
      const impact = Number.isFinite(detail.impact) ? detail.impact : 0;
      const orb = Number.isFinite(detail.orb) ? detail.orb : Number.POSITIVE_INFINITY;
      const existing = aspectMap.get(key) || {
        key,
        label: dailyAspectBarLabel(aspect),
        angle,
        maxStrength: 0,
        rankPriority: 0,
        rankImpact: 0,
        peakOrb: Number.POSITIVE_INFINITY,
        peakHour: hour,
        slots: new Map(),
        slotDetails: new Map(),
      };
      const previousSlotStrength = existing.slots.get(hour) || 0;
      existing.slots.set(hour, Math.max(previousSlotStrength, strength));
      if (strength >= previousSlotStrength) {
        existing.slotDetails.set(hour, detail);
      }
      existing.maxStrength = Math.max(existing.maxStrength, strength);
      existing.rankPriority = Math.max(existing.rankPriority, priority);
      existing.rankImpact = Math.max(existing.rankImpact, impact);
      if (orb < existing.peakOrb) {
        existing.peakOrb = orb;
        existing.peakHour = hour;
      }
      aspectMap.set(key, existing);
    });
  });

  const aspectBlocks = Array.from(aspectMap.values())
    .filter((item) => item.maxStrength > 0)
    .sort((a, b) => b.maxStrength - a.maxStrength)
    .flatMap((item) => {
      const segments = Array.from({ length: DAILY_PERFORMANCE_TOTAL_HOURS / DAILY_PERFORMANCE_SAMPLE_STEP_HOURS }, (_, segmentIndex) => {
        const start = segmentIndex * DAILY_PERFORMANCE_SAMPLE_STEP_HOURS;
        const slotStrength = item.slots.get(start) || 0;
        const detail = item.slotDetails.get(start) || null;
        const opacity = detail ? dailyAspectOrbOpacity(detail.orb, item.peakOrb) : 0;
        return {
          start,
          active: Boolean(detail),
          width: 100 / (DAILY_PERFORMANCE_TOTAL_HOURS / DAILY_PERFORMANCE_SAMPLE_STEP_HOURS),
          opacity,
          detail,
          strength: slotStrength,
        };
      });
      const activeSegments = segments.filter((segment) => segment.active);
      const blocks = [];
      activeSegments.forEach((segment) => {
        const previous = blocks[blocks.length - 1];
        const gapFromPrevious = previous ? segment.start - previous.end : Infinity;
        if (previous && gapFromPrevious >= -0.001 && gapFromPrevious <= DAILY_PERFORMANCE_SAMPLE_STEP_HOURS + 0.001) {
          previous.end = segment.start + DAILY_PERFORMANCE_SAMPLE_STEP_HOURS;
          if ((segment.detail?.strength || 0) >= (previous.detail?.strength || 0)) {
            previous.detail = segment.detail;
          }
          previous.opacitySegments.push({ start: segment.start, opacity: segment.opacity });
          previous.includesPeak = previous.includesPeak || Math.abs(segment.start - item.peakHour) < DAILY_PERFORMANCE_SAMPLE_STEP_HOURS / 2;
          return;
        }
        blocks.push({
          start: segment.start,
          end: segment.start + DAILY_PERFORMANCE_SAMPLE_STEP_HOURS,
          opacitySegments: [{ start: segment.start, opacity: segment.opacity }],
          detail: segment.detail,
          includesPeak: Math.abs(segment.start - item.peakHour) < DAILY_PERFORMANCE_SAMPLE_STEP_HOURS / 2,
        });
      });
      return blocks.map((block) => {
        const duration = Math.max(DAILY_PERFORMANCE_SAMPLE_STEP_HOURS, block.end - block.start);
        const opacityStops = block.opacitySegments.map((segment) => ({
          offset: (((segment.start + (DAILY_PERFORMANCE_SAMPLE_STEP_HOURS / 2)) - block.start) / duration) * 100,
          opacity: segment.opacity,
        }));
        return {
          ...block,
          key: `${item.key}-${block.start}`,
          aspectKey: item.key,
          label: item.label,
          detail: block.detail,
          polarity: dailyTimelinePolarity(block.detail),
          left: (block.start / DAILY_PERFORMANCE_TOTAL_HOURS) * 100,
          width: ((block.end - block.start) / DAILY_PERFORMANCE_TOTAL_HOURS) * 100,
          score: item.maxStrength,
          rankPriority: item.rankPriority,
          peakOrb: item.peakOrb,
          rankImpact: item.rankImpact,
          opacityStops,
        };
      });
    });

  return aspectBlocks;
}

function compareDailyTimelineAspectRank(a = {}, b = {}) {
  const priorityDifference = Number(b.rankPriority || 0) - Number(a.rankPriority || 0);
  if (priorityDifference) return priorityDifference;

  const aOrb = Number.isFinite(Number(a.peakOrb)) ? Number(a.peakOrb) : Number.POSITIVE_INFINITY;
  const bOrb = Number.isFinite(Number(b.peakOrb)) ? Number(b.peakOrb) : Number.POSITIVE_INFINITY;
  if (aOrb !== bOrb) return aOrb - bOrb;

  const impactDifference = Math.abs(Number(b.rankImpact || 0)) - Math.abs(Number(a.rankImpact || 0));
  if (impactDifference) return impactDifference;
  return Number(a.start || 0) - Number(b.start || 0);
}

function selectDailyTimelineAspectBlocks(blocks = [], showAll = false) {
  const ranked = blocks.slice().sort(compareDailyTimelineAspectRank);
  if (showAll || ranked.length <= DAILY_TIMELINE_DEFAULT_LIMIT) return ranked;

  const selected = [];
  const addTop = (polarity, limit) => {
    ranked
      .filter((block) => block.polarity === polarity)
      .slice(0, limit)
      .forEach((block) => selected.push(block));
  };
  addTop("positive", 5);
  addTop("negative", 5);
  addTop("neutral", 3);

  const selectedKeys = new Set(selected.map((block) => block.key));
  ranked.forEach((block) => {
    if (selected.length >= DAILY_TIMELINE_DEFAULT_LIMIT || selectedKeys.has(block.key)) return;
    selected.push(block);
    selectedKeys.add(block.key);
  });
  return selected;
}

function buildDailyTimelineLanes(blocks = []) {
  const lanes = [];
  const preferredLaneByAspect = new Map();
  blocks
    .sort((a, b) => (a.start === b.start ? b.score - a.score : a.start - b.start))
    .forEach((block) => {
      const preferredLaneIndex = preferredLaneByAspect.get(block.aspectKey);
      const preferredLane = Number.isInteger(preferredLaneIndex) ? lanes[preferredLaneIndex] : null;
      const lane = preferredLane && preferredLane.every((existing) => !rangesOverlap(existing, block))
        ? preferredLane
        : lanes.find((candidate) => candidate.every((existing) => !rangesOverlap(existing, block))) || [];
      if (!lanes.includes(lane)) lanes.push(lane);
      lane.push(block);
      preferredLaneByAspect.set(block.aspectKey, lanes.indexOf(lane));
    });

  return lanes.map((lane) => lane.sort((a, b) => a.start - b.start));
}

function DashboardV2DailyFlowCard({ data, displayDate = "" }) {
  const [hoveredPerformanceIndex, setHoveredPerformanceIndex] = useState(null);
  const [selectedPerformanceIndex, setSelectedPerformanceIndex] = useState(null);
  const [activeAspectTooltip, setActiveAspectTooltip] = useState(null);
  const [isActionAdviceOpen, setIsActionAdviceOpen] = useState(false);
  const [isAllTimelineAspectsOpen, setIsAllTimelineAspectsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const performanceData = Array.isArray(data.dailyPerformance)
    ? data.dailyPerformance
    : Array.isArray(data.daily_performance)
      ? data.daily_performance
      : [];
  const dailyPerformanceHourOrder = DAILY_PERFORMANCE_SAMPLE_HOURS;
  const dailyPerformanceOrderIndex = new Map(dailyPerformanceHourOrder.map((hour, index) => [hour, index]));
  const fallbackPattern = [
    { time: "00:00", hour: 0, drive: 34, flow: 44, inspiration: 55, friction: 22, marsActivity: 12 },
    { time: "03:00", hour: 3, drive: 45, flow: 51, inspiration: 48, friction: 34, marsActivity: 18 },
    { time: "06:00", hour: 6, drive: 40, flow: 47, inspiration: 38, friction: 28, marsActivity: 14 },
    { time: "09:00", hour: 9, drive: 58, flow: 62, inspiration: 45, friction: 46, marsActivity: 36 },
    { time: "12:00", hour: 12, drive: 63, flow: 58, inspiration: 52, friction: 31, marsActivity: 24 },
    { time: "15:00", hour: 15, drive: 56, flow: 66, inspiration: 61, friction: 54, marsActivity: 42 },
    { time: "18:00", hour: 18, drive: 70, flow: 60, inspiration: 57, friction: 36, marsActivity: 30 },
    { time: "21:00", hour: 21, drive: 64, flow: 68, inspiration: 49, friction: 42, marsActivity: 34 },
  ];
  const fallbackPerformance = DAILY_PERFORMANCE_SAMPLE_HOURS.map((hour) => {
    const base = fallbackPattern.find((point) => point.hour === hour % 24) || fallbackPattern[0];
    return {
      ...base,
      hour,
      dayOffset: Math.floor(hour / 24),
      time: `${String(hour % 24).padStart(2, "0")}:00`,
    };
  });
  const chartPerformance = (performanceData.length ? performanceData : fallbackPerformance)
    .slice()
    .sort((a, b) => {
      const aHour = dailyAspectHour(a);
      const bHour = dailyAspectHour(b);
      return (dailyPerformanceOrderIndex.get(aHour) ?? 99) - (dailyPerformanceOrderIndex.get(bHour) ?? 99);
    });
  const allTimelineAspectBlocks = buildDailyTimelineAspectBlocks(chartPerformance);
  const displayedTimelineAspectBlocks = selectDailyTimelineAspectBlocks(allTimelineAspectBlocks, isAllTimelineAspectsOpen);
  const timelineAspectLanes = buildDailyTimelineLanes(displayedTimelineAspectBlocks);
  const hiddenTimelineAspectCount = Math.max(0, allTimelineAspectBlocks.length - displayedTimelineAspectBlocks.length);
  const focusPoints = chartPerformance.map((point) => Number(point.drive ?? 0));
  const flowPoints = chartPerformance.map((point) => Number(point.flow ?? 0));
  const inspirationPoints = chartPerformance.map((point) => Number(point.inspiration ?? 0));
  const hazardPoints = chartPerformance.map((point) => Number(point.friction ?? 0));
  const marsActivityPoints = chartPerformance.map((point) => Number(point.marsActivity ?? 0));
  const width = 720;
  const height = 160;
  const pad = 8;
  const chartDate = formatIsoDate(displayDate || dashboardDisplayDate(data));
  const axisTicks = DAILY_PERFORMANCE_AXIS_HOURS.map((hour) => dailyPerformanceAxisTick(chartDate, hour));
  const chartStartDate = dateKeyToLocalDate(chartDate);
  const chartStartMidnight = chartStartDate
    ? new Date(chartStartDate.getFullYear(), chartStartDate.getMonth(), chartStartDate.getDate())
    : null;
  const currentTimeOffsetHours = chartStartMidnight
    ? ((currentTime.getTime() - chartStartMidnight.getTime()) / 3600000)
    : NaN;
  const currentX = pad + (Math.max(0, Math.min(DAILY_PERFORMANCE_TOTAL_HOURS, currentTimeOffsetHours)) / DAILY_PERFORMANCE_TOTAL_HOURS) * (width - pad * 2);
  const showCurrentTimeLine = Number.isFinite(currentTimeOffsetHours) && currentTimeOffsetHours >= 0 && currentTimeOffsetHours <= DAILY_PERFORMANCE_TOTAL_HOURS;
  const defaultPerformanceIndex = chartPerformance.length
    ? Math.max(
        0,
        Math.min(
          chartPerformance.length - 1,
          Math.round(
            (Number.isFinite(currentTimeOffsetHours)
              ? Math.max(0, Math.min(DAILY_PERFORMANCE_TOTAL_HOURS, currentTimeOffsetHours))
              : 0) / DAILY_PERFORMANCE_SAMPLE_STEP_HOURS
          )
        )
      )
    : null;
  const effectiveSelectedPerformanceIndex = Number.isInteger(selectedPerformanceIndex)
    ? Math.max(0, Math.min(chartPerformance.length - 1, selectedPerformanceIndex))
    : defaultPerformanceIndex;
  const pointsFor = (values, direction = "positive") => values
    .map((value, index) => {
      const x = pad + (index / Math.max(1, values.length - 1)) * (width - pad * 2);
      const range = height - pad * 2;
      const normalized = Math.max(0, Math.min(100, Number(value || 0))) / 100;
      const y = direction === "negative"
        ? height - pad - normalized * range
        : height - pad - normalized * range;
      return { x, y };
    });
  const smoothPathFor = (values, direction = "positive") => {
    const curvePoints = pointsFor(values, direction);
    if (!curvePoints.length) return "";
    if (curvePoints.length === 1) return `M ${curvePoints[0].x.toFixed(1)} ${curvePoints[0].y.toFixed(1)}`;
    const commands = [`M ${curvePoints[0].x.toFixed(1)} ${curvePoints[0].y.toFixed(1)}`];
    for (let index = 0; index < curvePoints.length - 1; index += 1) {
      const current = curvePoints[index];
      const next = curvePoints[index + 1];
      const controlX = (current.x + next.x) / 2;
      commands.push(
        `C ${controlX.toFixed(1)} ${current.y.toFixed(1)}, ${controlX.toFixed(1)} ${next.y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`
      );
    }
    return commands.join(" ");
  };
  const marsAreaPoints = pointsFor(marsActivityPoints);
  const marsAreaPath = marsAreaPoints.length
    ? `${smoothPathFor(marsActivityPoints)} L ${width - pad} ${height - pad} L ${pad} ${height - pad} Z`
    : "";
  const focusPath = smoothPathFor(focusPoints);
  const flowPath = smoothPathFor(flowPoints);
  const inspirationPath = smoothPathFor(inspirationPoints);
  const hazardPath = smoothPathFor(hazardPoints);
  const hoveredPerformance = Number.isInteger(hoveredPerformanceIndex)
    ? chartPerformance[hoveredPerformanceIndex]
    : null;
  const selectedPerformance = Number.isInteger(selectedPerformanceIndex)
    ? chartPerformance[effectiveSelectedPerformanceIndex]
    : Number.isInteger(effectiveSelectedPerformanceIndex)
      ? chartPerformance[effectiveSelectedPerformanceIndex]
    : null;
  const selectedAdvice = dailyPerformanceActionAdvice(selectedPerformance);
  const hoveredX = Number.isInteger(hoveredPerformanceIndex)
    ? pad + (hoveredPerformanceIndex / Math.max(1, chartPerformance.length - 1)) * (width - pad * 2)
    : null;
  const selectedX = Number.isInteger(effectiveSelectedPerformanceIndex)
    ? pad + (effectiveSelectedPerformanceIndex / Math.max(1, chartPerformance.length - 1)) * (width - pad * 2)
    : null;
  const hoveredTooltipLeft = hoveredX === null ? 0 : `${(hoveredX / width) * 100}%`;
  const performanceIndexFromPointer = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - bounds.left) / bounds.width) * width;
    const ratio = Math.max(0, Math.min(1, (svgX - pad) / Math.max(1, width - pad * 2)));
    return Math.round(ratio * Math.max(0, chartPerformance.length - 1));
  };
  const handlePerformancePointerMove = (event) => {
    setHoveredPerformanceIndex(performanceIndexFromPointer(event));
  };
  const handlePerformanceClick = (event) => {
    setSelectedPerformanceIndex(performanceIndexFromPointer(event));
  };
  const handleTransitAspectClick = (event, block, detail, score) => {
    event.preventDefault();
    event.stopPropagation();
    const position = dailyAspectTooltipPosition(event);
    setActiveAspectTooltip((current) => (
      current?.key === block.key
        ? null
        : {
            key: block.key,
            label: detail.label || block.label,
            description: detail.description || detail.advisedTask || "",
            score,
            position,
          }
    ));
  };
  return (
    <DashboardV2Card className="min-h-[620px]" bodyClassName="!px-3 !pb-2 !pt-2">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="group relative flex items-center gap-2">
          <h2 className="font-sans text-base font-black tracking-tight text-[#f3f3f0]">デイリーパフォーマンス</h2>
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#e9c349]/35 font-mono text-[10px] text-[#e9c349]">i</span>
          <span className="pointer-events-none absolute left-0 top-7 z-20 w-[280px] rounded-xl border border-[#e9c349]/25 bg-[#0d0e0f]/95 px-3 py-2 text-[11px] font-bold leading-5 text-[#e2e2e2] opacity-0 shadow-xl transition group-hover:opacity-100">
            <span className="block text-[#e9c349]">今日の行動を最適化するための指標です</span>
            <span className="mt-2 block"><span className="text-[#fb923c]">Mars</span> 行動量/熱量</span>
            <span className="block"><span className="text-[#38bdf8]">Drive</span> 集中力/突破力</span>
            <span className="block"><span className="text-[#34d399]">Flow</span> 同調性/対人協調</span>
            <span className="block"><span className="text-[#a78bfa]">Inspiration</span> 直感/発想力</span>
            <span className="block"><span className="text-[#ff5c68]">Friction</span> 摩擦と焦燥の警戒度</span>
          </span>
        </div>
        <div className="hidden items-center gap-5 font-sans text-[11px] font-bold text-[#c7c6cc] sm:flex">
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[linear-gradient(180deg,#fb923c_0%,#fb923c_30%,#8f241b_64%,#160707_100%)] shadow-[0_0_14px_rgba(251,146,60,0.5)]" />Mars</span>
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#38bdf8] shadow-[0_0_14px_rgba(56,189,248,0.65)]" />Drive</span>
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#34d399] shadow-[0_0_14px_rgba(52,211,153,0.55)]" />Flow</span>
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#a78bfa] shadow-[0_0_14px_rgba(167,139,250,0.45)]" />Inspiration</span>
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[#ff5c68] shadow-[0_0_14px_rgba(255,92,104,0.5)]" />Friction</span>
        </div>
      </div>
      <div className="grid gap-1">
        <div className="relative">
          {hoveredPerformance ? (
            <div
              className="pointer-events-none absolute top-2 z-20 min-w-[156px] -translate-x-1/2 rounded-xl border border-white/10 bg-[#0d0e0f]/95 px-3 py-2 font-mono text-[10px] font-bold text-[#e2e2e2] shadow-[0_18px_50px_rgba(0,0,0,0.42)]"
              style={{ left: hoveredTooltipLeft }}
            >
              <p className="mb-1 text-[#e9c349]">{dailyPerformanceTimeLabel(hoveredPerformance, hoveredPerformanceIndex, chartDate)}</p>
              <div className="grid gap-1">
                <span className="flex items-center justify-between gap-4"><span className="text-[#fb923c]">Mars</span><span>{Math.round(Number(hoveredPerformance.marsActivity ?? 0))}</span></span>
                <span className="flex items-center justify-between gap-4"><span className="text-[#38bdf8]">Drive</span><span>{Math.round(Number(hoveredPerformance.drive ?? 0))}</span></span>
                <span className="flex items-center justify-between gap-4"><span className="text-[#34d399]">Flow</span><span>{Math.round(Number(hoveredPerformance.flow ?? 0))}</span></span>
                <span className="flex items-center justify-between gap-4"><span className="text-[#a78bfa]">Inspiration</span><span>{Math.round(Number(hoveredPerformance.inspiration ?? 0))}</span></span>
                <span className="flex items-center justify-between gap-4"><span className="text-[#ff5c68]">Friction</span><span>{Math.round(Number(hoveredPerformance.friction ?? 0))}</span></span>
              </div>
            </div>
          ) : null}
          <svg
            className="h-[168px] w-full"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="デイリーパフォーマンスグラフ"
            onMouseMove={handlePerformancePointerMove}
            onMouseLeave={() => setHoveredPerformanceIndex(null)}
            onClick={handlePerformanceClick}
          >
          <defs>
            <linearGradient id="dailyMarsArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#fb923c" stopOpacity="0.28" />
              <stop offset="55%" stopColor="#ef4444" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          {marsAreaPath ? <path d={marsAreaPath} fill="url(#dailyMarsArea)" opacity="0.95" /> : null}
          {showCurrentTimeLine ? (
            <line x1={currentX} x2={currentX} y1={pad} y2={height - pad} stroke="#e9c349" strokeWidth="1.5" opacity="0.85" filter="drop-shadow(0 0 8px rgba(233,195,73,0.8))" />
          ) : null}
          <path d={focusPath} fill="none" stroke="#38bdf8" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" filter="drop-shadow(0 0 8px rgba(56,189,248,0.35))" />
          <path d={flowPath} fill="none" stroke="#34d399" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" filter="drop-shadow(0 0 8px rgba(52,211,153,0.3))" />
          <path d={inspirationPath} fill="none" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" filter="drop-shadow(0 0 8px rgba(167,139,250,0.28))" />
          <path d={hazardPath} fill="none" stroke="#ff5c68" strokeWidth="2.8" strokeDasharray="8 8" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" filter="drop-shadow(0 0 8px rgba(255,92,104,0.28))" />
          {selectedX !== null ? (
            <line x1={selectedX} x2={selectedX} y1={pad} y2={height - pad} stroke="#f3f3f0" strokeWidth="1.5" opacity="0.8" strokeDasharray="4 4" />
          ) : null}
          {hoveredX !== null ? (
            <>
              <line x1={hoveredX} x2={hoveredX} y1={pad} y2={height - pad} stroke="rgba(255,255,255,0.35)" strokeWidth="1" strokeDasharray="3 5" />
              {[
                { values: marsActivityPoints, direction: "positive", color: "#fb923c" },
                { values: focusPoints, direction: "positive", color: "#38bdf8" },
                { values: flowPoints, direction: "positive", color: "#34d399" },
                { values: inspirationPoints, direction: "positive", color: "#a78bfa" },
                { values: hazardPoints, direction: "positive", color: "#ff5c68" },
              ].map((series, index) => {
                const point = pointsFor(series.values, series.direction)[hoveredPerformanceIndex];
                return point ? (
                  <circle
                    key={`daily-tooltip-point-${index}`}
                    cx={point.x}
                    cy={point.y}
                    r="4"
                    fill={series.color}
                    stroke="#0d0e0f"
                    strokeWidth="2"
                  />
                ) : null;
              })}
            </>
          ) : null}
          <rect x={pad} y={pad} width={width - pad * 2} height={height - pad * 2} fill="transparent" pointerEvents="all" />
        </svg>
        </div>
        <div
          className="relative h-8 cursor-pointer font-mono text-[8px] font-bold leading-none text-[#909096] sm:text-[10px]"
          onClick={handlePerformanceClick}
        >
          {axisTicks.map((tick) => (
            <span
              key={`daily-axis-${tick.hour}`}
              className={cx(
                "absolute top-0 flex min-w-[2.35rem] flex-col gap-1",
                tick.hour === 0
                  ? "translate-x-0 items-start text-left"
                  : tick.hour === DAILY_PERFORMANCE_TOTAL_HOURS
                    ? "-translate-x-full items-end text-right"
                    : "-translate-x-1/2 items-center text-center"
              )}
              style={{ left: `${tick.left}%` }}
            >
              <span className="h-3 text-[8px] text-[#e9c349]/80 sm:text-[9px]">{tick.dateLabel}</span>
              <span>{tick.time}</span>
            </span>
          ))}
        </div>
        {selectedPerformance && selectedAdvice ? (
          <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2.5 shadow-[0_12px_34px_rgba(0,0,0,0.18)]">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 text-left focus:outline-none focus:ring-2 focus:ring-[#e9c349]/35"
              aria-expanded={isActionAdviceOpen}
              onClick={() => setIsActionAdviceOpen((value) => !value)}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#e9c349]/25 bg-[#e9c349]/10 px-2.5 py-1 font-mono text-[10px] font-black text-[#e9c349]">
                  {dailyPerformanceTimeLabel(selectedPerformance, effectiveSelectedPerformanceIndex, chartDate)}
                </span>
                {selectedAdvice.actionMode && selectedAdvice.actionMode !== "Pattern" ? (
                  <span className="rounded-full border border-[#38bdf8]/25 bg-[#38bdf8]/10 px-2 py-0.5 text-[9px] font-bold text-[#38bdf8]">
                    {selectedAdvice.actionMode}
                  </span>
                ) : null}
                <span className="min-w-0 truncate text-xs font-black text-[#f3f3f0]">
                  {selectedAdvice.headline || "行動アドバイス"}
                </span>
              </div>
              <span className="shrink-0 text-[#e9c349]" aria-hidden="true">
                {isActionAdviceOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </span>
            </button>
            {isActionAdviceOpen ? (
              <>
                <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[9px] font-bold">
                  {Number.isFinite(Number(selectedAdvice.frictionScore)) ? (
                    <span className="rounded-full border border-[#ff5c68]/25 bg-[#ff5c68]/10 px-2 py-1 text-[#ff9aa3]">
                      注意: 焦り・摩擦 {selectedAdvice.frictionScore}
                      {selectedAdvice.frictionState ? ` (${DAILY_PERFORMANCE_FRICTION_STATE_LABELS[selectedAdvice.frictionState] || selectedAdvice.frictionState})` : ""}
                    </span>
                  ) : null}
                  {Number.isFinite(Number(selectedAdvice.marsScore)) ? (
                    <span className="rounded-full border border-[#fb923c]/25 bg-[#fb923c]/10 px-2 py-1 text-[#fbbf8b]">
                      補助: 行動エネルギー {selectedAdvice.marsScore}
                      {selectedAdvice.marsState ? ` (${DAILY_PERFORMANCE_MARS_STATE_LABELS[selectedAdvice.marsState] || selectedAdvice.marsState})` : ""}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 grid gap-1.5 text-[11px] leading-5 text-[#c7c6cc] sm:grid-cols-3">
                  {selectedAdvice.recommendedAction ? <p>{selectedAdvice.recommendedAction}</p> : null}
                  {selectedAdvice.thinkingStyle ? <p>{selectedAdvice.thinkingStyle}</p> : null}
                  {selectedAdvice.restGuidance ? <p>{selectedAdvice.restGuidance}</p> : null}
                </div>
              </>
            ) : (
              <p className="mt-1 line-clamp-1 text-[10px] leading-5 text-[#909096]">
                {selectedAdvice.recommendedAction || selectedAdvice.thinkingStyle || selectedAdvice.restGuidance || ""}
              </p>
            )}
          </div>
        ) : null}
        <div className="mt-3 border-t border-white/10 pt-2">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-sans text-[10px] font-black text-[#c7c6cc]">
              重要なアスペクト {displayedTimelineAspectBlocks.length} / {allTimelineAspectBlocks.length}
            </span>
            {allTimelineAspectBlocks.length > DAILY_TIMELINE_DEFAULT_LIMIT ? (
              <button
                type="button"
                className="shrink-0 border-b border-[#e9c349]/45 pb-0.5 text-[10px] font-black text-[#e9c349] transition hover:text-[#fff0b2] focus:outline-none focus:ring-2 focus:ring-[#e9c349]/35"
                aria-expanded={isAllTimelineAspectsOpen}
                onClick={() => setIsAllTimelineAspectsOpen((value) => !value)}
              >
                {isAllTimelineAspectsOpen ? "重要なアスペクトに戻す" : `他 ${hiddenTimelineAspectCount} 件を表示`}
              </button>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            {timelineAspectLanes.map((lane, laneIndex) => (
              <div key={`daily-timeline-${laneIndex}`} className="relative h-4">
                <div className="absolute inset-0">
                  {lane.map((block) => {
                    const detail = block.detail || {};
                    const score = Number(detail.score || 0);
                    const color = DAILY_TIMELINE_COLORS[block.polarity] || DAILY_TIMELINE_COLORS.neutral;
                    const isTooltipOpen = activeAspectTooltip?.key === block.key;
                    return (
                    <button
                      type="button"
                      key={block.key}
                      className="absolute top-0 z-10 h-full cursor-pointer text-left focus:outline-none"
                      style={{
                        left: `${block.left}%`,
                        width: `${block.width}%`,
                      }}
                      aria-label={block.label}
                      aria-expanded={isTooltipOpen}
                      onClick={(event) => handleTransitAspectClick(event, block, detail, score)}
                    >
                      <span
                        className="flex h-full w-full items-center overflow-hidden rounded-full"
                        style={{
                        background: dailyTimelineAspectGradient(color, block.opacityStops),
                        boxShadow: block.includesPeak
                          ? `0 0 16px ${color}`
                          : "none",
                        }}
                      >
                        <span className="block truncate px-2 text-[9px] font-black leading-none text-[#f3f3f0] drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] sm:text-[10px]">
                          {block.label}
                        </span>
                      </span>
                    </button>
                  );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        {activeAspectTooltip && typeof document !== "undefined" ? createPortal((
          <div
            className="fixed z-[80] overflow-hidden rounded-2xl border border-white/10 bg-[#0d0e0f]/95 text-slate-200 shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-sm"
            style={{
              left: `${activeAspectTooltip.position.left}px`,
              top: `${activeAspectTooltip.position.top}px`,
              width: `${activeAspectTooltip.position.width}px`,
              height: `${activeAspectTooltip.position.height}px`,
            }}
          >
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
                <span className="min-w-0 break-words text-xs font-bold leading-5 text-slate-200">
                  {activeAspectTooltip.label}
                </span>
                <span className={cx("shrink-0 text-xs font-black", activeAspectTooltip.score >= 0 ? "text-sky-200" : "text-rose-200")}>
                  {activeAspectTooltip.score > 0 ? "+" : ""}{Number.isFinite(activeAspectTooltip.score) ? activeAspectTooltip.score : 0}
                </span>
                <button
                  type="button"
                  className="-mr-1 -mt-1 shrink-0 rounded-full px-1.5 py-0.5 text-xs font-black text-slate-400 transition hover:bg-white/10 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#e9c349]/35"
                  aria-label="ツールチップを閉じる"
                  onClick={() => setActiveAspectTooltip(null)}
                >
                  ×
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-width:thin]">
                {activeAspectTooltip.description ? (
                  <p className="break-words text-xs font-light leading-6 text-slate-300">
                    {activeAspectTooltip.description}
                  </p>
                ) : (
                  <p className="text-xs font-light leading-6 text-slate-400">説明はありません。</p>
                )}
              </div>
            </div>
          </div>
        ), document.body) : null}
      </div>
    </DashboardV2Card>
  );
}

function DailyPerformanceDeveloperView({ data = dashboardData }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const performanceData = Array.isArray(data.dailyPerformance)
    ? data.dailyPerformance
    : Array.isArray(data.daily_performance)
      ? data.daily_performance
      : [];
  const dailyPerformanceHourOrder = DAILY_PERFORMANCE_SAMPLE_HOURS;
  const orderIndex = new Map(dailyPerformanceHourOrder.map((hour, index) => [hour, index]));
  const rows = performanceData
    .slice()
    .sort((a, b) => {
      const aHour = dailyAspectHour(a);
      const bHour = dailyAspectHour(b);
      return (orderIndex.get(aHour) ?? 99) - (orderIndex.get(bHour) ?? 99);
    });
  const selected = rows[selectedIndex] || rows[0] || {};
  const metricGroups = [
    { key: "mars", label: "Mars", color: "#fb923c", value: selected.marsActivity },
    { key: "drive", label: "Drive", color: "#38bdf8", value: selected.drive },
    { key: "flow", label: "Flow", color: "#34d399", value: selected.flow },
    { key: "inspiration", label: "Inspiration", color: "#a78bfa", value: selected.inspiration },
    { key: "friction", label: "Friction", color: "#ff5c68", value: selected.friction },
  ];
  return (
    <div className="min-h-screen bg-[#111313] p-5 text-[#e2e2e2]">
      <div className="mx-auto grid max-w-[1500px] gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-2xl border border-white/15 bg-[#181a1a] p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-[#e9c349]">Developer View</p>
              <h1 className="mt-1 font-notoSerif text-2xl font-semibold">デイリーパフォーマンス検証</h1>
            </div>
            <p className="font-mono text-xs text-[#909096]">{data.reading_date || data.readingDate || ""}</p>
          </div>
          <DashboardV2DailyFlowCard data={data} />
          <div className="mt-4 grid grid-cols-4 gap-2">
            {rows.map((item, index) => (
              <button
                key={item.time || index}
                type="button"
                onClick={() => setSelectedIndex(index)}
                className={cx(
                  "rounded-xl border px-3 py-2 text-left font-mono text-xs transition",
                  selectedIndex === index
                    ? "border-[#e9c349] bg-[#e9c349]/12 text-[#e9c349]"
                    : "border-white/10 bg-white/[0.03] text-[#c7c6cc] hover:border-white/25"
                )}
              >
                <span className="block font-black">{item.time || "--:--"}</span>
                <span className="mt-1 block text-[10px] text-[#909096]">
                  D {Math.round(Number(item.drive ?? 0))} / I {Math.round(Number(item.inspiration ?? 0))}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="min-h-[calc(100vh-40px)] rounded-2xl border border-white/15 bg-[#181a1a] p-4">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-[#e9c349]">Aspect Breakdown</p>
              <h2 className="mt-1 font-notoSerif text-2xl font-semibold">{selected.time || "--:--"}</h2>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {metricGroups.map((metric) => (
                <div key={metric.key} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-right">
                  <p className="font-mono text-[10px] font-black" style={{ color: metric.color }}>{metric.label}</p>
                  <p className="font-mono text-lg font-black text-[#f3f3f0]">{Math.round(Number(metric.value ?? 0))}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 158px)" }}>
            {metricGroups.map((metric) => {
              const items = Array.isArray(selected.breakdown?.[metric.key]) ? selected.breakdown[metric.key] : [];
              return (
                <details key={metric.key} open className="rounded-xl border border-white/10 bg-[#0d0e0f]/55">
                  <summary className="cursor-pointer list-none px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-xs font-black" style={{ color: metric.color }}>{metric.label}</p>
                      <span className="font-mono text-[11px] text-[#909096]">{items.length} aspects</span>
                    </div>
                  </summary>
                  <div className="grid gap-2 border-t border-white/10 p-3">
                    {items.length ? items.map((item, index) => (
                      <article key={`${metric.key}-${item.source?.rowKey || item.label || index}`} className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-bold leading-5 text-[#f3f3f0]">{item.label || "Aspect"}</p>
                            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[#909096]">
                              {item.note} / orb {item.orb} / priority {item.priority}
                            </p>
                          </div>
                          <div className="shrink-0 text-right font-mono">
                            <p className="text-xs text-[#909096]">score impact</p>
                            <p className="text-lg font-black" style={{ color: metric.color }}>{item.scoreContribution ?? item.contribution}</p>
                            <p className="text-[10px] text-[#909096]">raw {item.rawContribution ?? item.contribution}</p>
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-4 gap-2 font-mono text-[10px] text-[#c7c6cc]">
                          <span>Score {item.scoreImpact}</span>
                          <span>Dignity {item.essentialDignityScore}</span>
                          <span>Decision {item.decisionFlag}</span>
                          <span>Sync {item.syncFlag}</span>
                        </div>
                        {item.description ? (
                          <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#c7c6cc]">{item.description}</p>
                        ) : null}
                      </article>
                    )) : (
                      <p className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-[#909096]">該当アスペクトなし</p>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

const YEARLY_DEV_SCORE_KEYS = [
  { key: "general", label: "全般・健康", color: "#2F9E68" },
  { key: "work", label: "仕事", color: "#2F6FED" },
  { key: "love", label: "恋愛・対人", color: "#D84C8B" },
  { key: "money", label: "お金", color: "#D4AF37" },
];

function monthNumberFromDate(value) {
  const month = Number(String(value || "").slice(5, 7));
  return Number.isFinite(month) && month >= 1 && month <= 12 ? month : 0;
}

const YEARLY_MONTHLY_SCORE_SCALE = 1.0;

function yearlyMonthlyPercentile(values, percentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const ratio = position - lowerIndex;
  return sorted[lowerIndex] + ((sorted[upperIndex] - sorted[lowerIndex]) * ratio);
}

function monthlyScoreSummary(values) {
  if (!values.length) return { score: 0, low: 0, high: 0 };
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const scale = (value) => Math.max(-100, Math.min(100, Math.round(value * YEARLY_MONTHLY_SCORE_SCALE)));
  const score = scale(average);
  const percentileLow = scale(yearlyMonthlyPercentile(values, 0.1));
  const percentileHigh = scale(yearlyMonthlyPercentile(values, 0.9));
  return {
    score,
    low: Math.min(score, percentileLow),
    high: Math.max(score, percentileHigh),
  };
}

function yearlySmoothPointPath(points, startCommand = "M") {
  if (!points.length) return "";
  const commands = [`${startCommand} ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
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

function yearlySmoothRangePath(upper, lower) {
  if (!upper.length || !lower.length) return "";
  return `${yearlySmoothPointPath(upper)} ${yearlySmoothPointPath([...lower].reverse(), "L")} Z`;
}

function monthlyYearlyDeveloperData(forecast) {
  const yearlyData = Array.isArray(forecast?.yearly_data) ? forecast.yearly_data : [];
  const year =
    Number(forecast?.cache?.year) ||
    Number(String(forecast?.reading_date || forecast?.date || yearlyData[0]?.date || "2026").slice(0, 4)) ||
    2026;

  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const days = yearlyData.filter((day) => monthNumberFromDate(day?.date) === month);
    const scores = {};
    const scoreRanges = {};
    ["total", ...YEARLY_DEV_SCORE_KEYS.map((item) => item.key)].forEach((key) => {
      const values = days
        .map((day) => Number(day?.scores?.[key]))
        .filter((value) => Number.isFinite(value));
      const summary = monthlyScoreSummary(values);
      scores[key] = summary.score;
      scoreRanges[key] = { low: summary.low, high: summary.high };
    });
    const peakDay = days.length
      ? days.reduce((best, day) => Number(day?.scores?.total ?? -Infinity) > Number(best?.scores?.total ?? -Infinity) ? day : best, days[0])
      : null;
    const lowDay = days.length
      ? days.reduce((best, day) => Number(day?.scores?.total ?? Infinity) < Number(best?.scores?.total ?? Infinity) ? day : best, days[0])
      : null;

    return {
      month,
      label: `${month}月`,
      date: `${year}-${String(month).padStart(2, "0")}-01`,
      days,
      scores,
      scoreRanges,
      peakDay,
      lowDay,
    };
  });
}

export function AnnualBiorhythmDeveloperView({ data = dashboardData }) {
  const forecast = data.yearly_forecast || data.yearlyForecast || null;
  const months = monthlyYearlyDeveloperData(forecast);
  const initialMonth = Math.max(1, monthNumberFromDate(forecast?.reading_date || data.reading_date || data.readingDate) || 1);
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const selected = months[selectedMonth - 1] || months[0];
  const width = 900;
  const height = 300;
  const padX = 54;
  const padY = 28;
  const chartX = (index) => padX + (index / Math.max(1, months.length - 1)) * (width - padX * 2);
  const chartY = (value) => padY + ((100 - Math.max(-100, Math.min(100, Number(value) || 0))) / 200) * (height - padY * 2);
  const smoothPathFor = (key) => {
    const points = months.map((month, index) => ({ x: chartX(index), y: chartY(month.scores[key]) }));
    if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    const commands = [`M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`];
    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      const controlX = (current.x + next.x) / 2;
      commands.push(`C ${controlX.toFixed(1)} ${current.y.toFixed(1)}, ${controlX.toFixed(1)} ${next.y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`);
    }
    return commands.join(" ");
  };
  const rangePathFor = (key) => {
    const upper = months.map((month, index) => ({
      x: chartX(index),
      y: chartY(month.scoreRanges?.[key]?.high ?? month.scores[key]),
    }));
    const lower = months.map((month, index) => ({
      x: chartX(index),
      y: chartY(month.scoreRanges?.[key]?.low ?? month.scores[key]),
    }));
    return yearlySmoothRangePath(upper, lower);
  };
  const selectedX = chartX(selected.month - 1);
  const strongestCategory = YEARLY_DEV_SCORE_KEYS.reduce((best, item) =>
    Math.abs(Number(selected.scores[item.key] || 0)) > Math.abs(Number(selected.scores[best.key] || 0)) ? item : best
  , YEARLY_DEV_SCORE_KEYS[0]);

  return (
    <div className="min-h-screen bg-[#111313] p-5 text-[#e2e2e2]">
      <div className="mx-auto grid max-w-[1500px] gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <section className="rounded-2xl border border-white/15 bg-[#181a1a] p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-[#e9c349]">Developer View</p>
              <h1 className="mt-1 font-notoSerif text-2xl font-semibold">Annual Biorhythm 2026 検証</h1>
            </div>
            <p className="font-mono text-xs text-[#909096]">{forecast?.reading_date || data.reading_date || data.readingDate || ""}</p>
          </div>

          <div className="rounded-2xl border border-[#e9c349]/22 bg-[#1a1c1c]/54 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-sans text-base font-black tracking-tight text-[#f3f3f0]">Annual Biorhythm 2026</h2>
              <div className="flex flex-wrap gap-3 font-sans text-[11px] font-bold text-[#c7c6cc]">
                {YEARLY_DEV_SCORE_KEYS.map((item) => (
                  <span key={item.key} className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
            <svg className="h-[245px] w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Annual Biorhythm developer chart">
              {[100, 50, 0, -50, -100].map((score) => (
                <g key={score}>
                  <line x1={padX} x2={width - padX} y1={chartY(score)} y2={chartY(score)} stroke="rgba(255,255,255,0.08)" />
                  <text x={padX - 12} y={chartY(score) + 4} textAnchor="end" fill="#909096" fontSize="12" fontFamily="monospace">{score}</text>
                </g>
              ))}
              {YEARLY_DEV_SCORE_KEYS.map((item) => (
                <path key={`${item.key}-range`} d={rangePathFor(item.key)} fill={item.color} opacity="0.07" />
              ))}
              {YEARLY_DEV_SCORE_KEYS.map((item) => (
                <path key={item.key} d={smoothPathFor(item.key)} fill="none" stroke={item.color} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
              ))}
              <line x1={selectedX} x2={selectedX} y1={padY} y2={height - padY} stroke="#e9c349" strokeWidth="2" strokeDasharray="5 5" />
              {months.map((month, index) => (
                <g key={month.month} className="cursor-pointer" onClick={() => setSelectedMonth(month.month)}>
                  <text x={chartX(index)} y={height - 4} textAnchor="middle" fill={month.month === selected.month ? "#e9c349" : "#909096"} fontSize="14" fontFamily="monospace">
                    {month.month}
                  </text>
                </g>
              ))}
            </svg>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {months.map((month) => (
              <button
                key={month.month}
                type="button"
                onClick={() => setSelectedMonth(month.month)}
                className={cx(
                  "rounded-xl border px-3 py-2 text-left font-mono text-xs transition",
                  selectedMonth === month.month
                    ? "border-[#e9c349] bg-[#e9c349]/12 text-[#e9c349]"
                    : "border-white/10 bg-white/[0.03] text-[#c7c6cc] hover:border-white/25"
                )}
              >
                <span className="block font-black">{month.label}</span>
                <span className="mt-1 block text-[10px] text-[#909096]">
                  Avg {formatYearlyScore(month.scores.total)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="min-h-[calc(100vh-40px)] rounded-2xl border border-white/15 bg-[#181a1a] p-4">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-[#e9c349]">Monthly Breakdown</p>
              <h2 className="mt-1 font-notoSerif text-2xl font-semibold">{selected.label}</h2>
              <p className="mt-1 text-xs text-[#909096]">
                {selected.days.length} days / Peak {selected.peakDay?.date || "-"} / Low {selected.lowDay?.date || "-"}
              </p>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {[{ key: "total", label: "Total", color: "#e9c349" }, ...YEARLY_DEV_SCORE_KEYS].map((metric) => (
                <div key={metric.key} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-right">
                  <p className="font-mono text-[10px] font-black" style={{ color: metric.color }}>{metric.label}</p>
                  <p className="font-mono text-lg font-black text-[#f3f3f0]">{formatYearlyScore(selected.scores[metric.key])}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-4 rounded-xl border border-[#e9c349]/25 bg-[#140e00]/25 p-3">
            <p className="font-mono text-[11px] font-black uppercase tracking-[0.24em] text-[#e9c349]">Strongest Category</p>
            <p className="mt-2 text-sm font-bold text-[#f3f3f0]">{strongestCategory.label} / {formatYearlyScore(selected.scores[strongestCategory.key])}</p>
          </div>

          <div className="grid gap-3 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 220px)" }}>
            <details open className="rounded-xl border border-white/10 bg-[#0d0e0f]/55">
              <summary className="cursor-pointer list-none px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-xs font-black text-[#e9c349]">Daily Scores</p>
                  <span className="font-mono text-[11px] text-[#909096]">{selected.days.length} days</span>
                </div>
              </summary>
              <div className="grid gap-1 border-t border-white/10 p-3 font-mono text-[10px]">
                {selected.days.map((day) => (
                  <div key={day.date} className="grid grid-cols-[92px_repeat(5,1fr)] gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5 text-[#c7c6cc]">
                    <span className="text-[#f3f3f0]">{day.date}</span>
                    <span>Total {formatYearlyScore(day.scores?.total)}</span>
                    {YEARLY_DEV_SCORE_KEYS.map((item) => (
                      <span key={item.key}>{item.label} {formatYearlyScore(day.scores?.[item.key])}</span>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          </div>
        </section>
      </div>
    </div>
  );
}

function DashboardV2YearlyCard({ forecast, developerMode }) {
  const data = Array.isArray(forecast?.yearly_data) ? forecast.yearly_data : [];
  const currentYear = new Date().getFullYear();
  const demoData = Array.from({ length: 12 }, (_, index) => {
    const total = [40, 50, 55, 50, 52, 60, 65, 75, 85, 88, 70, 75][index];
    return {
      date: `2026-${String(index + 1).padStart(2, "0")}-01`,
      scores: {
        total,
        general: [60, 65, 55, 75, 85, 90, 88, 82, 70, 75, 80, 85][index],
        work: [80, 85, 90, 88, 92, 95, 85, 78, 75, 70, 85, 90][index],
        love: [60, 65, 55, 75, 85, 90, 88, 82, 70, 75, 80, 85][index],
        money: [40, 50, 55, 50, 52, 60, 65, 75, 85, 88, 70, 75][index],
      },
      text_description: "年運の流れを確認し、強まるテーマに合わせて行動の優先順位を整えます。",
    };
  });
  const usesDemoData = !data.length;
  const chartData = usesDemoData ? demoData : data;
  const width = 900;
  const height = 420;
  const padX = 68;
  const padY = 34;
  const scoreKeys = ["general", "work", "love", "money"];
  const monthLabels = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const monthlyData = Array.from({ length: 12 }, (_, monthIndex) => {
    const monthItems = chartData.filter((day) => {
      const month = Number(String(day?.date || "").slice(5, 7));
      return month === monthIndex + 1;
    });
    if (!monthItems.length) {
      return {
        date: `2026-${String(monthIndex + 1).padStart(2, "0")}-01`,
        scores: Object.fromEntries(scoreKeys.map((key) => [key, 0])),
        scoreRanges: Object.fromEntries(scoreKeys.map((key) => [key, { low: 0, high: 0 }])),
      };
    }
    const scores = {};
    const scoreRanges = {};
    scoreKeys.forEach((key) => {
      const values = monthItems
        .map((day) => Number(day?.scores?.[key]))
        .filter((value) => Number.isFinite(value));
      const summary = usesDemoData
        ? { score: values[0] || 0, low: values[0] || 0, high: values[0] || 0 }
        : monthlyScoreSummary(values);
      scores[key] = summary.score;
      scoreRanges[key] = { low: summary.low, high: summary.high };
    });
    return {
      ...monthItems[Math.floor(monthItems.length / 2)],
      scores,
      scoreRanges,
    };
  });
  const visibleData = monthlyData;
  const workdayMonthIndex = Math.max(0, Math.min(11, new Date().getMonth()));
  const currentMonthX = padX + (workdayMonthIndex / 11) * (width - padX * 2);
  const selectedDay = visibleData[workdayMonthIndex] || visibleData[0] || {};
  const scoreColors = {
    total: "#6d5bd7",
    general: "#2F9E68",
    work: "#2F6FED",
    love: "#D84C8B",
    money: "#D4AF37",
  };
  const metricCards = [
    { label: "全般・健康", key: "general" },
    { label: "仕事", key: "work" },
    { label: "恋愛・対人", key: "love" },
    { label: "お金", key: "money" },
  ];
  const pointsFor = (key) => visibleData
    .map((day, index) => {
      const x = visibleData.length <= 1 ? padX : padX + (index / (visibleData.length - 1)) * (width - padX * 2);
      const value = Math.max(-100, Math.min(100, Number(day?.scores?.[key] ?? 0)));
      const y = padY + ((100 - value) / 200) * (height - padY * 2);
      return { x, y };
    });
  const smoothPathFor = (key) => {
    const points = pointsFor(key);
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
  };
  const rangePathFor = (key) => {
    const upper = visibleData.map((day, index) => ({
      x: visibleData.length <= 1 ? padX : padX + (index / (visibleData.length - 1)) * (width - padX * 2),
      y: padY + ((100 - Math.max(-100, Math.min(100, Number(day?.scoreRanges?.[key]?.high ?? day?.scores?.[key] ?? 0)))) / 200) * (height - padY * 2),
    }));
    const lower = visibleData.map((day, index) => ({
      x: visibleData.length <= 1 ? padX : padX + (index / (visibleData.length - 1)) * (width - padX * 2),
      y: padY + ((100 - Math.max(-100, Math.min(100, Number(day?.scoreRanges?.[key]?.low ?? day?.scores?.[key] ?? 0)))) / 200) * (height - padY * 2),
    }));
    return yearlySmoothRangePath(upper, lower);
  };
  return (
    <DashboardV2Card bodyClassName="p-5">
      {chartData.length ? (
        <div className="space-y-4">
          <div className="grid items-start gap-4 md:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <p className="font-mono text-xs font-black uppercase tracking-[0.28em] text-[#e9c349]">Long-Term Vision</p>
            </div>
            <h2 className="max-w-[500px] justify-self-start text-left font-notoSerif text-lg font-semibold leading-snug tracking-[0.04em] text-[#e2e2e2] md:text-[22px]">
              {currentYear}年 運勢予測
            </h2>
          </div>
          <svg className="h-[270px] w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="2026年運勢スコアグラフ">
            <defs>
              <filter id="v2ChartGlow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            {[100, 50, 0, -50, -100].map((score) => {
              const y = padY + ((100 - score) / 200) * (height - padY * 2);
              return (
                <g key={score}>
                  <line x1={padX} x2={width - padX} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  <text x={padX - 14} y={y + 4} textAnchor="end" fill="#909096" fontSize="13" fontFamily="monospace">
                    {score}
                  </text>
                </g>
              );
            })}
            {["love", "money", "work", "general"].map((key) => (
              <path key={`${key}-range`} d={rangePathFor(key)} fill={scoreColors[key]} opacity="0.055" />
            ))}
            {["love", "money", "work", "general"].map((key) => (
              <path
                key={key}
                d={smoothPathFor(key)}
                fill="none"
                stroke={scoreColors[key]}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.95"
                filter="url(#v2ChartGlow)"
              />
            ))}
            <line
              x1={currentMonthX}
              x2={currentMonthX}
              y1={padY - 2}
              y2={height - padY}
              stroke="#e9c349"
              strokeWidth="2"
              opacity="0.9"
            />
            <circle
              cx={currentMonthX}
              cy={padY - 3}
              r="5"
              fill="#e9c349"
              opacity="0.95"
              filter="url(#v2ChartGlow)"
            />
            {visibleData.map((day, index) => {
              const x = visibleData.length <= 1 ? padX : padX + (index / Math.max(1, visibleData.length - 1)) * (width - padX * 2);
              return (
                <text key={`${day.date}-${index}`} x={x} y={height - 4} textAnchor="middle" fill="#909096" fontSize="15" fontFamily="monospace">
                  {monthLabels[index] || ""}
                </text>
              );
            })}
          </svg>
          <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
            {metricCards.map((item) => (
              <div key={item.key} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.045] p-2 sm:p-3">
                <p className="flex min-w-0 items-center gap-1.5 font-mono text-[9px] font-black uppercase leading-tight tracking-[0.02em] text-[#e2e2e2] sm:gap-2 sm:text-[11px] sm:tracking-[0.08em]">
                  <span className="h-2 w-2 shrink-0 rounded-full sm:h-2.5 sm:w-2.5" style={{ backgroundColor: scoreColors[item.key] }} />
                  <span className="min-w-0 break-words">{item.label}</span>
                </p>
                <p className="mt-2 font-notoSerif text-lg leading-none text-[#f3f3f0] sm:text-2xl">{formatYearlyScore(selectedDay?.scores?.[item.key])}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex min-h-[640px] items-center justify-center rounded-2xl border border-white/10 bg-[#0d0e0f]/60 p-6 font-mono text-sm font-bold uppercase tracking-[0.18em] text-[#c7c6cc]">
          年運データがありません
        </div>
      )}
    </DashboardV2Card>
  );
}

function splitStoredReportSections(content) {
  const lines = String(content || "").split("\n");
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^【第\d+章[：:].+】$/.test(trimmed) || /^縲千ｬｬ\d+遶・・+縲・/.test(trimmed)) {
      if (currentSection) {
        sections.push({ ...currentSection, body: currentSection.body.trim() });
      }
      currentSection = { title: trimmed, body: "" };
      continue;
    }

    if (currentSection) {
      currentSection.body += `${currentSection.body ? "\n" : ""}${line}`;
    }
  }

  if (currentSection) {
    sections.push({ ...currentSection, body: currentSection.body.trim() });
  }

  return sections.filter((section) => section.title || section.body);
}

export function DashboardV2HoroscopePage({ data }) {
  const [storedPayload, setStoredPayload] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      return getStoredReadingResult({ allowStale: true });
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    try {
      setStoredPayload(getStoredReadingResult({ allowStale: true }));
    } catch {
      setStoredPayload(null);
    }
    getStoredReadingResultAsync({ allowStale: true })
      .then((payload) => {
        if (!cancelled && payload) {
          setStoredPayload(payload);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const payload = storedPayload || data || {};
  const readings = Array.isArray(payload.readings) ? payload.readings : Array.isArray(data?.readings) ? data.readings : [];
  const meta = payload.meta || data?.meta || {};
  const chartData = payload.chart_data || payload.chartData || data?.chart_data || data?.chartData || null;

  if (data?.is_loading) {
    return (
      <main className="mx-auto max-w-[1440px] px-5 py-5 md:px-8 lg:px-14">
        <DashboardV2Card bodyClassName="flex min-h-[220px] items-center justify-center p-8">
          <p className="font-mono text-sm font-bold tracking-[0.18em] text-[#c7c6cc]">読込中</p>
        </DashboardV2Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1440px] px-5 py-5 md:px-8 lg:px-14">
      <section className="mb-5 border-b border-white/10 pb-5">
        <p className="font-mono text-[10px] font-black uppercase tracking-[0.3em] text-[#e9c349]">The Reading</p>
        <h1 className="mt-2 font-notoSerif text-3xl font-semibold leading-tight text-[#f3f3f0] md:text-5xl">
          Curated Results
        </h1>
      </section>

      {meta && Object.keys(meta).length ? (
        <DashboardV2Card className="mb-5" bodyClassName="p-5">
          <div className="grid gap-4 font-mono text-xs font-bold text-[#c7c6cc] md:grid-cols-3">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.22em] text-[#e9c349]">Name</p>
              <p>{meta.full_name || meta.name || "-"}</p>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.22em] text-[#e9c349]">Birth</p>
              <p>
                {[meta.birth_date, meta.birth_time].filter(Boolean).join(" ") || "-"}
                {meta.timezone_offset !== undefined ? ` / UTC${Number(meta.timezone_offset) >= 0 ? "+" : ""}${meta.timezone_offset}` : ""}
              </p>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.22em] text-[#e9c349]">Place</p>
              <p>{meta.birthplace || meta.location || "-"}</p>
            </div>
          </div>
        </DashboardV2Card>
      ) : null}

      {readings.length ? (
        <div className="grid gap-5">
          {readings.map((item, itemIndex) => {
            const sections = splitStoredReportSections(item.content);
            const title = item.type === "full_report" ? "フルリポート" : item.title || item.type || "リポート";
            return (
              <DashboardV2Card key={`${item.type || "reading"}-${itemIndex}`} bodyClassName="p-0">
                <details className="group" open={itemIndex === 0}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border-b border-white/10 px-5 py-5">
                    <div>
                      <p className="font-mono text-[10px] font-black uppercase tracking-[0.3em] text-[#e9c349]">Reading</p>
                      <h2 className="mt-2 font-notoSerif text-2xl font-semibold text-[#f3f3f0]">{title}</h2>
                    </div>
                    <ChevronRight size={20} className="shrink-0 text-[#e9c349] transition group-open:rotate-90" />
                  </summary>
                  <div className="grid gap-4 p-5 lg:grid-cols-2">
                    {sections.length ? (
                      sections.map((section, sectionIndex) => (
                        <article key={`${section.title}-${sectionIndex}`} className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d0e0f]/45">
                          <details className="group">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                              <h3 className="font-notoSerif text-lg font-semibold leading-snug text-[#f3f3f0]">{section.title}</h3>
                              <ChevronRight size={18} className="shrink-0 text-[#e9c349] transition group-open:rotate-90" />
                            </summary>
                            <div className="border-t border-white/10 px-5 pb-5 pt-4">
                              <p className="whitespace-pre-wrap text-sm font-medium leading-7 text-[#c7c6cc]">{section.body}</p>
                            </div>
                          </details>
                        </article>
                      ))
                    ) : (
                      <article className="lg:col-span-2 rounded-2xl border border-white/10 bg-[#0d0e0f]/45 p-5">
                        <p className="whitespace-pre-wrap text-sm font-medium leading-7 text-[#c7c6cc]">{item.content || "表示できるリポートがありません。"}</p>
                      </article>
                    )}
                  </div>
                </details>
              </DashboardV2Card>
            );
          })}
        </div>
      ) : (
        <DashboardV2Card bodyClassName="p-8">
          <p className="font-mono text-sm font-bold uppercase tracking-[0.18em] text-[#909096]">
            保存済みの鑑定結果がありません
          </p>
        </DashboardV2Card>
      )}

      {chartData ? (
        <DashboardV2Card className="mt-5" bodyClassName="p-5">
          <p className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.3em] text-[#e9c349]">Natal Data</p>
          <pre className="whitespace-pre-wrap font-mono text-xs leading-6 text-[#c7c6cc]">
            {Object.entries(chartData).map(([key, value]) => `${key}: ${value}`).join("\n")}
          </pre>
        </DashboardV2Card>
      ) : null}
    </main>
  );
}

function DashboardV2({ data = dashboardData, embedded = false, developerMode = false }) {
  const forecast = data.yearly_forecast || data.yearlyForecast || null;

  return (
    <div className={cx(
      "min-h-screen bg-[#171919] text-[#e2e2e2]",
      "bg-[radial-gradient(circle_at_50%_0%,rgba(211,188,249,0.12),transparent_34%),radial-gradient(circle_at_15%_24%,rgba(233,195,73,0.08),transparent_26%)]",
      embedded ? "" : ""
    )}>
      <DashboardV2Header data={data} displayDate={dashboardDisplayDate(data)} activePage="dashboard" />
      <main className="mx-auto grid max-w-[1440px] gap-5 px-5 py-5 md:px-8 lg:px-14">
        <DashboardV2YearlyCard forecast={forecast} developerMode={developerMode} />
      </main>
      <footer className="border-t border-white/10 px-5 py-8">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 font-mono text-xs uppercase tracking-[0.28em] text-[#909096] md:px-11">
          <span>ASTRAEA Celestial Insights</span>
          <span>Stellar API</span>
        </div>
      </footer>
    </div>
  );
}

export function DashboardDailyDetailContentLayer({ data = dashboardData, className = "", onDisplayDateChange = null }) {
  if (data?.is_loading) {
    return (
      <DashboardV2Card className={className} bodyClassName="flex min-h-[220px] items-center justify-center p-8">
        <p className="font-mono text-sm font-bold tracking-[0.18em] text-[#c7c6cc]">読込中</p>
      </DashboardV2Card>
    );
  }
  return (
    <DashboardDailyDetailLayerBase
      data={data}
      className={className}
      insightVariant="monthly"
      onDisplayDateChange={onDisplayDateChange}
    />
  );
}

function DashboardDailyDetailLayerBase({
  data = dashboardData,
  className = "",
  insightVariant = "monthly",
  onDisplayDateChange = null,
}) {
  const [activeDailyData, setActiveDailyData] = useState(data);
  const [selectedDailyDate, setSelectedDailyDate] = useState(() => currentTokyoDate());
  const [isDailyDateLoading, setIsDailyDateLoading] = useState(false);
  const [dailyDateError, setDailyDateError] = useState("");
  const [focusedAspect, setFocusedAspect] = useState(null);
  const dailyDataCacheRef = React.useRef(new Map());
  const dailyDateRequestIdRef = React.useRef(0);
  const displayDate = selectedDailyDate || dashboardDisplayDate(activeDailyData);

  useEffect(() => {
    if (displayDate && onDisplayDateChange) {
      onDisplayDateChange(displayDate);
    }
  }, [displayDate, onDisplayDateChange]);

  useEffect(() => {
    const today = currentTokyoDate();
    const sourceDate = dashboardDataDate(data);
    const nextDate = sourceDate === today ? sourceDate : today;
    setActiveDailyData(data);
    setSelectedDailyDate(nextDate);
    setFocusedAspect(null);
    if (nextDate && sourceDate === nextDate) {
      dailyDataCacheRef.current.set(nextDate, data);
    } else if (nextDate) {
      dailyDataCacheRef.current.delete(nextDate);
    }
  }, [data]);

  useEffect(() => {
    const targetDate = selectedDailyDate || dashboardDisplayDate(activeDailyData);
    const activeDataDate = dashboardDataDate(activeDailyData);
    if (!targetDate || (activeDataDate === targetDate && hasWeeklyAspectFeed(activeDailyData))) return;

    const formPayload = getStoredReadingForm();
    if (!formPayload) return;

    const requestId = dailyDateRequestIdRef.current + 1;
    dailyDateRequestIdRef.current = requestId;
    setIsDailyDateLoading(true);
    setDailyDateError("");
    postDashboardJson("/api/readings", {
      ...formPayload,
      target_date: targetDate,
    })
      .then((payload) => {
        if (dailyDateRequestIdRef.current !== requestId) return;
        const nextData = dashboardDataFromReadingPayload(payload, data, targetDate);
        if (nextData) {
          dailyDataCacheRef.current.set(targetDate, nextData);
          setActiveDailyData(nextData);
        }
      })
      .catch((error) => {
        if (dailyDateRequestIdRef.current !== requestId) return;
        setDailyDateError(error?.message || "直近1週間のアスペクト取得に失敗しました。");
      })
      .finally(() => {
        if (dailyDateRequestIdRef.current === requestId) {
          setIsDailyDateLoading(false);
        }
      });
  }, [activeDailyData, data, selectedDailyDate]);

  const handleDailyDateShift = async (days) => {
    const nextDate = addDaysToIsoDate(displayDate || dashboardDisplayDate(activeDailyData), days);
    if (!nextDate) return;

    const cached = dailyDataCacheRef.current.get(nextDate);
    setSelectedDailyDate(nextDate);
    setFocusedAspect(null);
    setDailyDateError("");
    if (cached) {
      setActiveDailyData(cached);
      return;
    }

    const formPayload = getStoredReadingForm();
    if (!formPayload) {
      setDailyDateError("保存済みの出生情報がないため、日付を切り替えられません。");
      return;
    }

    const requestId = dailyDateRequestIdRef.current + 1;
    dailyDateRequestIdRef.current = requestId;
    setIsDailyDateLoading(true);
    try {
      const payload = await postDashboardJson("/api/readings", {
        ...formPayload,
        target_date: nextDate,
      });
      if (dailyDateRequestIdRef.current !== requestId) return;
      const nextData = dashboardDataFromReadingPayload(payload, data, nextDate);
      if (nextData) {
        dailyDataCacheRef.current.set(nextDate, nextData);
        setActiveDailyData(nextData);
      }
    } catch (error) {
      if (dailyDateRequestIdRef.current !== requestId) return;
      setDailyDateError(error?.message || "日付データの取得に失敗しました。");
      setSelectedDailyDate(dashboardDisplayDate(activeDailyData));
    } finally {
      if (dailyDateRequestIdRef.current === requestId) {
        setIsDailyDateLoading(false);
      }
    }
  };

  return (
    <div className={cx("grid gap-3 lg:grid-cols-[0.92fr_1.08fr]", className)}>
      <div className="grid gap-3">
        {dailyDateError ? (
          <p className="rounded-xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-xs font-bold leading-5 text-rose-100">
            {dailyDateError}
          </p>
        ) : null}
        {insightVariant === "saved" ? (
          <DashboardV2PersonalCard
            data={activeDailyData}
            displayDate={displayDate}
            onDateShift={handleDailyDateShift}
            isDateLoading={isDailyDateLoading}
          />
        ) : (
          <DashboardV2DailyThemeCard
            data={activeDailyData}
            displayDate={displayDate}
            onDateShift={handleDailyDateShift}
            isDateLoading={isDailyDateLoading}
            focusedAspect={focusedAspect}
          />
        )}
        <DashboardV2CountdownCard
          data={activeDailyData}
          onSelectAspect={(key) => setFocusedAspect(key ? { key, token: Date.now() } : null)}
        />
      </div>
      <DashboardV2DailyFlowCard data={activeDailyData} displayDate={displayDate} />
    </div>
  );
}

export function Dashboard({ data = dashboardData, embedded = false, developerMode = false }) {
  if (typeof window !== "undefined") {
    try {
      const view = new URL(window.location.href).searchParams.get("view");
      if (view === "daily-performance-dev") {
        return <DailyPerformanceDeveloperView data={data} />;
      }
      if (view === "annual-biorhythm-dev") {
        return <AnnualBiorhythmDeveloperView data={data} />;
      }
    } catch {
      // Fall through to the standard dashboard.
    }
  }
  return <DashboardV2 data={data} embedded={embedded} developerMode={developerMode} />;
}


