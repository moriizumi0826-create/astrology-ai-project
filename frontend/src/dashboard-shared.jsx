import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { YearlyForecastGraph } from "./yearly-forecast.jsx";
import {
  BatteryMedium,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Crown,
  Code2,
  Gauge,
  History,
  Shield,
  Sparkles,
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
  hero: {
    rank: "B+",
    title: "慎重に余白を守る日",
    guidance: "今いちばん優先したいことを一つ選び、そこへ集中するほど流れが整います。",
    summary:
      "本来は着実に土台を築けるあなたです。今日は周囲の刺激が強まりやすいため、最優先の一手へ意識を絞るほど安定します。",
    description: "品質管理、分析、医療、教育など、一つずつ確実に進める作業と好相性です。",
    guideline: "腹痛や神経過敏、過労に注意して、休息と水分補給を意識してください。",
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
  diagnostic: {
    score: 74,
    statusLabel: "調整優先",
    summary:
      "流れは維持できていますが、優先順位を絞るほど精度が上がります。到達目安はあと12日です。",
    primaryFactor: {
      title: "恋愛運・追い風モード突入まで",
      impact: -12,
      advisedTask: "過去のやり取りを整理し、今いちばん必要な一歩へ集中する",
    },
    items: [
      {
        label: "意思決定の整合性",
        value: 82,
        description: "仕事運と日運の効率補正から、判断軸のブレにくさを算出しています。",
      },
      {
        label: "感情と行動の同期",
        value: 68,
        description: "月や愛情・健康テーマのアスペクトから、内面と行動の噛み合いを見ています。",
      },
      {
        label: "外部ノイズ耐性",
        value: 74,
        description: "負荷の強いアスペクトと安全度補正から、外圧への耐性を可視化しています。",
      },
    ],
  },
  timeline: [
    {
      label: "08:00-12:00",
      score: 84,
      recommendation: "複雑な判断向き",
      detail: "判断速度と整合性が噛み合いやすく、設計や分析の骨子づくりに向く時間帯です。",
    },
    {
      label: "13:00-17:00",
      score: 61,
      recommendation: "単純作業向き",
      detail: "集中の波がやや分散しやすいため、整理やレビューのような粒度の揃った作業が安定します。",
    },
    {
      label: "18:00-22:00",
      score: 72,
      recommendation: "対話と振り返り向き",
      detail: "感情と言語化が連動しやすく、面談準備や日報、関係調整のメモ作成に向いています。",
    },
  ],
  topics: [
    {
      title: "仕事優位性",
      icon: BriefcaseBusiness,
      value: "74%",
      caption: "オペレーション安定度",
      tone: "gold",
      body:
        "分析や実務の精度を上げる作業に追い風があります。段取りを細かく刻むほど成果へつながりやすい日です。",
    },
    {
      title: "対人バリア",
      icon: Shield,
      value: "60%",
      caption: "バリア強度",
      tone: "navy",
      body:
        "強い干渉は避けたい日です。必要な対話だけを選び、余計な摩擦を減らすほど安定します。",
    },
    {
      title: "回復エネルギー",
      icon: BatteryMedium,
      value: "40%",
      caption: "エネルギー残量",
      tone: "signal",
      body:
        "消耗が出やすいので、頑張りすぎる前に休憩を入れる設計が有効です。",
    },
  ],
  developerMeta: {
    personalReading: { logic: "", sources: [] },
    diagnostic: { logic: "", sources: [] },
    countdown: { logic: "", sources: [] },
    timeline: { logic: "", sources: [] },
    topics: { logic: "", sources: [] },
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

function PersonalReadingDeveloperBlock({ data, meta, className = "" }) {
  if (!meta) return null;

  const sources = Array.isArray(meta.sources) ? meta.sources : [];
  const aspectSource = sources.find((source) =>
    Array.isArray(source.columns) && source.columns.includes("Aspect_Logic_ID")
  );
  const basicSource = sources.find((source) =>
    Array.isArray(source.columns) && source.columns.includes("Planet_ID")
  );
  const aspectDescription = String(data?.summary || "").trim();

  const textEntries = [
      {
        label: "タイトル",
        text: data?.title,
        note: "Hero スコアからランクを判定し、そのランクに対応する定型キャッチコピーをバックエンドで生成しています。ランク判定は S: 90以上、A: 80以上、B+: 70以上、B: 60以上、C: 45以上、D: 30以上、E: 29以下です。",
        columns: ["Score_Impact", "Work_Efficiency_Modifier", "rank"],
        source: null,
        generatedLabel: "生成ロジック",
        generatedDetail: "CSV直参照ではなく、backend/app/services/reading_service.py の _score_to_rank と _rank_to_catchcopy で生成しています。S、A、B+、B、C、D、E それぞれに別のキャッチコピーを割り当てています。",
      },
    {
      label: "強調バッジ",
      text: data?.description,
      note: "ネイタル基本解釈から、今日いちばん強いカテゴリに応じて Text_Work または Text_Love を採用し、無い場合は Text_General にフォールバックします。",
      columns: ["Text_Work", "Text_Love", "Text_General"],
      source: basicSource,
    },
    {
      label: "行動ガイダンス",
      text: data?.guidance,
      note: "最優先アスペクト行の Advised_Task をそのまま表示しています。",
      columns: ["Advised_Task"],
      source: aspectSource,
    },
    {
      label: "Text_Description",
      text: aspectDescription,
      note: "最優先アスペクト行の Text_Description を省略せず、そのまま全文表示しています。",
        columns: ["Text_Description", "Advised_Task"],
        source: aspectSource,
    },
    {
      label: "処方箋",
      text: data?.guideline,
      note: "ネイタル基本解釈の Text_Health をそのまま使っています。",
      columns: ["Text_Health"],
      source: basicSource,
    },
  ].filter((entry) => entry.text);

  return (
    <div className={cx("mt-5 rounded-3xl border border-dashed border-[#D4AF37]/35 bg-[#fffaf0] p-4", className)}>
      <div className="mb-3 flex items-center gap-2 text-[#0A192F]">
        <Code2 size={16} className="text-[#D4AF37]" />
        <p className="text-sm font-bold">PersonalReading の根拠</p>
      </div>
      {meta.logic ? <p className="mb-3 text-sm leading-6 text-slate-700">{meta.logic}</p> : null}
      <div className="mb-4 space-y-2">
        {textEntries.map((entry, index) => (
          <div key={`${entry.label}-${index}`} className="rounded-2xl border border-[#D4AF37]/20 bg-white/70 px-3 py-3">
            <p className="text-xs font-semibold text-[#0A192F]">{entry.label}</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">{entry.note}</p>
              {entry.source ? (
                <>
                  <p className="mt-2 text-[11px] font-semibold text-slate-700">出典情報</p>
                  <p className="mt-2 text-[11px] font-semibold text-[#0A192F]">
                    {entry.source.csv || "CSV不明"}
                    {entry.source.row ? ` / 行 ${entry.source.row}` : ""}
                  {entry.source.key ? ` / ${entry.source.key}` : ""}
                </p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-600">
                    参照列: {entry.columns.join(", ")}
                  </p>
                  {entry.generatedDetail ? (
                    <>
                      <p className="mt-2 text-[11px] font-semibold text-slate-700">{entry.generatedLabel || "生成テンプレート"}</p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-600">{entry.generatedDetail}</p>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="mt-2 text-[11px] font-semibold text-slate-700">{entry.generatedLabel || "生成ロジック"}</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-600">
                    {entry.generatedDetail || "CSV直参照ではなく、backend/app/services/reading_service.py などのロジックで生成しています。"}
                  </p>
                </>
              )}
              <p className="mt-2 text-[11px] font-semibold text-slate-700">表示中の文</p>
              <p className="mt-1 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-5 text-slate-700">{entry.text}</p>
            </div>
          ))}
        </div>
      <DeveloperSourceList sources={sources} />
    </div>
  );
}

function TimelineTextSourceList({ slot }) {
  if (!slot) return null;

  const textSources = [];
  const timelineAspects = Array.isArray(slot.timelineAspects) && slot.timelineAspects.length
    ? slot.timelineAspects
    : slot.sourceRow
      ? [{
          planetLabel: slot.sourceAspect?.t_planet || "",
          sourceRow: slot.sourceRow,
          sourceAspect: slot.sourceAspect,
          recommendedAction: slot.recommendedAction,
          description: slot.description || slot.detail,
        }]
      : [];

  if (timelineAspects.length) {
    timelineAspects.forEach((aspect) => {
      const sourceRow = aspect.sourceRow || {};
      const csv = sourceRow._csv_file || "CSV不明";
      const row = sourceRow._csv_row;
      const key = sourceRow.Aspect_Logic_ID || aspect.sourceAspect?.t_planet || "";
      const prefix = aspect.planetLabel ? `${aspect.planetLabel} / ` : "";
      if (aspect.recommendedAction) {
        textSources.push({
          label: `${prefix}推奨アクション`,
          csv,
          row,
          key,
          column: "Recommended_Action / Advised_Task",
          text: aspect.recommendedAction,
        });
      }
      if (aspect.description) {
        textSources.push({
          label: `${prefix}説明文`,
          csv,
          row,
          key,
          column: "Text_Description",
          text: aspect.description,
        });
      }
    });
  } else if (slot.timelineAdviceRow) {
    const csv = slot.timelineAdviceRow._csv_file || "CSV不明";
    const row = slot.timelineAdviceRow._csv_row;
    const key = slot.timelineAdviceRow.Time_Slot_ID || slot.label || "";
    if (slot.recommendedAction) {
      textSources.push({
        label: "推奨アクション",
        csv,
        row,
        key,
        column: "Status_Label",
        text: slot.recommendedAction,
      });
    }
    if (slot.description || slot.detail) {
      textSources.push({
        label: "説明文",
        csv,
        row,
        key,
        column: "Status_Label",
        text: slot.description || slot.detail,
      });
    }
  }

  if (!textSources.length) return null;

  return (
    <div className="mb-3 space-y-2">
      <p className="text-[11px] font-bold text-slate-700">表示中の文章の出典</p>
      {textSources.map((source, index) => (
        <div
          key={`${source.label}-${source.csv}-${source.row || index}`}
          className="rounded-2xl border border-[#D4AF37]/20 bg-white/70 px-3 py-3"
        >
          <p className="text-[11px] font-semibold text-[#0A192F]">
            {source.label}: {source.csv}
            {source.row ? ` / 行 ${source.row}` : ""}
            {source.key ? ` / ${source.key}` : ""}
          </p>
          <p className="mt-1 text-[11px] leading-5 text-slate-600">参照列: {source.column}</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">{source.text}</p>
        </div>
      ))}
    </div>
  );
}

function TimelineDeveloperBlock({ entry, slot }) {
    if (!entry) return null;
  
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-[#D4AF37]/30 bg-[#fffaf0] p-3">
        <div className="mb-2 flex items-center gap-2 text-[#0A192F]">
          <Code2 size={14} className="text-[#D4AF37]" />
          <p className="text-xs font-bold">この時間帯の根拠</p>
        </div>
        <TimelineTextSourceList slot={slot} />
        {entry.logic ? <p className="mb-3 text-xs leading-6 text-slate-700">{entry.logic}</p> : null}
        <DeveloperSourceList sources={entry.sources || []} />
      </div>
    );
  }

function HeaderMotionMenu({ items = [], retrogradeCalendar = [] }) {
  const [isOpen, setIsOpen] = useState(false);
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

  const modal = isOpen && typeof document !== "undefined" ? createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
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
                onClick={() => setIsOpen(false)}
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
                  className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 sm:grid-cols-[140px_120px_1fr]"
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
            <MotionIndicatorGrid items={motionItems} compact />
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className={cx(
        "inline-flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm",
          isOpen
            ? "border-[#D4AF37] bg-[#fff7df] text-[#0A192F]"
            : "border-slate-200 bg-white text-[#0A192F] hover:border-[#D4AF37] hover:text-[#D4AF37]"
        )}
        aria-expanded={isOpen}
      >
        <Clock3 size={16} />
        <span>逆行カレンダー</span>
      </button>
      {modal}
    </>
  );
}

function Header({
  data: header,
  embedded = false,
  developerMode = false,
  onToggleDeveloperMode,
  mobileLayoutMode = "new",
  onSetMobileLayoutMode,
  planetMotion = [],
  retrogradeCalendar = [],
}) {
  const headerContent = (
    <header
      className={cx(
        "fixed inset-x-0 top-0 z-50 border-b border-slate-200/90 bg-[#f8fafc]/95 backdrop-blur-xl",
        ""
      )}
    >
      <div className="flex flex-col items-start gap-3 px-0 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-4 md:px-6">
        <div className="flex w-full min-w-0 items-center justify-between gap-3 sm:w-auto">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#0A192F] text-[#D4AF37] shadow-[0_18px_36px_rgba(10,25,47,0.08)] sm:h-11 sm:w-11">
              <Sparkles size={20} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-extrabold tracking-tight text-[#0A192F] sm:text-base">
                {header.brand.name}
              </p>
              <p className="truncate text-[10px] uppercase tracking-[0.14em] text-slate-500 sm:text-xs sm:tracking-[0.18em]">
                {header.brand.sublabel}
              </p>
            </div>
          </div>
          <div className="inline-flex shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1 text-[11px] font-semibold text-[#0A192F] shadow-sm md:hidden">
            {[
              ["old", "旧表記"],
              ["new", "新表記"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                className={cx(
                  "rounded-xl px-2.5 py-1.5 transition",
                  mobileLayoutMode === mode
                    ? "bg-[#0A192F] text-white"
                    : "text-slate-500 hover:text-[#D4AF37]"
                )}
                onClick={() => onSetMobileLayoutMode?.(mode)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <nav className="flex w-full max-w-full flex-nowrap items-center gap-2 overflow-x-auto pb-1 sm:w-auto sm:flex-wrap sm:justify-end sm:overflow-visible sm:pb-0">
          {header.actions.map((action, index) => {
            const iconMap = [History, UserCircle2, Crown];
            const Icon = iconMap[index] || UserCircle2;
            return (
              <button
                key={action}
                className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#0A192F] transition hover:border-[#D4AF37] hover:text-[#D4AF37] sm:px-4 sm:text-sm"
                type="button"
              >
                <Icon size={16} />
                <span>{action}</span>
              </button>
            );
          })}
          <HeaderMotionMenu items={planetMotion} retrogradeCalendar={retrogradeCalendar} />
          <button
            className={cx(
              "inline-flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm",
              developerMode
                ? "border-[#D4AF37] bg-[#fff7df] text-[#0A192F]"
                : "border-slate-200 bg-white text-[#0A192F] hover:border-[#D4AF37] hover:text-[#D4AF37]"
            )}
            onClick={onToggleDeveloperMode}
            type="button"
          >
            <Code2 size={16} />
            <span>開発者用</span>
          </button>
        </nav>
      </div>
    </header>
  );

  return (
    <>
      {typeof document !== "undefined" ? createPortal(headerContent, document.body) : headerContent}
      <div aria-hidden="true" className="h-[132px] shrink-0 sm:h-[80px]" />
    </>
    );
  }

function Hero({ data }) {
  return (
    <Panel title="ユーザーステータス" eyebrow="Today Overview" className="overflow-hidden">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-3 rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-4 py-2">
            <span className="rounded-full bg-[#D4AF37] px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-[#0A192F]">
              {data.title}
            </span>
            <span className="text-lg font-extrabold text-[#0A192F]">{data.rank}</span>
          </div>
          <div className="space-y-3">
            <p className="text-xl font-bold leading-relaxed text-[#0A192F] md:text-2xl">
              {data.guidance}
            </p>
            <p className="max-w-3xl text-sm leading-7 text-slate-600 md:text-base">{data.summary}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-[#0A192F]/10 bg-[#0A192F] p-5 text-white">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-2xl bg-white/10 p-3 text-[#D4AF37]">
              <Gauge size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/60">
                Diagnostic
              </p>
              <p className="text-lg font-bold">ロジック安定指標</p>
            </div>
          </div>
          <div className="space-y-4">
            {[
              ["諢乗晄ｱｺ螳壹・謨ｴ蜷域ｧ", "88%"],
              ["諢滓ュ縺ｨ陦悟虚縺ｮ蜷梧悄", "63%"],
              ["螟夜Κ繝弱う繧ｺ閠先ｧ", "71%"],
            ].map(([label, value]) => (
              <div key={label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/72">{label}</span>
                  <span className="font-bold text-[#D4AF37]">{value}</span>
                </div>
                <div className="h-2 rounded-full bg-white/10">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#f2da8a]"
                    style={{ width: value }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

const MOTION_STATUS_STYLES = {
  direct: {
    dot: "bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.65)]",
    label: "順行中",
  },
  stationary: {
    dot: "bg-yellow-300 shadow-[0_0_12px_rgba(253,224,71,0.7)]",
    label: "留/停止中",
  },
  retrograde: {
    dot: "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.7)]",
    label: "逆行中",
  },
};
const MOTION_PLANET_SORT_ORDER = [
  "MERCURY",
  "VENUS",
  "MARS",
  "JUPITER",
  "SATURN",
  "URANUS",
  "NEPTUNE",
  "PLUTO",
];

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

function TypographicHero({
  data,
  diagnosticData,
  planetMotion = [],
  retrogradeCalendar = [],
  displayDate = "",
  developerMode = false,
  developerMeta = {},
  showDiagnostic = true,
}) {
  const [personalReadingTab, setPersonalReadingTab] = useState("daily");
  const rank = data.rank || "B";
  const rankStyles = {
    S: "text-amber-300 drop-shadow-[0_0_18px_rgba(251,191,36,0.42)]",
    "S+": "text-amber-300 drop-shadow-[0_0_18px_rgba(251,191,36,0.42)]",
    A: "text-amber-400 drop-shadow-[0_0_14px_rgba(251,191,36,0.32)]",
    "A+": "text-amber-400 drop-shadow-[0_0_14px_rgba(251,191,36,0.32)]",
    B: "text-[#D4AF37]",
    "B+": "text-[#D4AF37]",
    C: "text-slate-300",
    D: "text-slate-400",
  };
  const rankClass = rankStyles[rank] || rankStyles[rank.slice(0, 1)] || "text-[#D4AF37]";
  const personalBody = String(data.summary || "").trim();
  const dailyStarVibe = String(data.dailyStarVibe || data.daily_star_vibe || "").trim();
  const aspectHighlights = data.aspectHighlights || data.aspect_highlights || {};
  const positiveHighlights = Array.isArray(aspectHighlights.positive) ? aspectHighlights.positive.slice(0, 2) : [];
  const negativeHighlights = Array.isArray(aspectHighlights.negative) ? aspectHighlights.negative.slice(0, 2) : [];
  const hasAspectHighlights = positiveHighlights.length > 0 || negativeHighlights.length > 0;
    const diagnostic = diagnosticData || data.diagnostic || dashboardData.diagnostic;
    const diagnosticItems =
      Array.isArray(diagnostic?.items) && diagnostic.items.length
        ? diagnostic.items
        : dashboardData.diagnostic.items;
    const diagnosticEntries = Array.isArray(developerMeta?.diagnostic?.entries)
      ? developerMeta.diagnostic.entries
      : [];

  return (
      <Panel
        title="ユーザーステータス"
        eyebrow="Today Overview"
        bare
        className="w-full max-w-full overflow-hidden"
        headerClassName="border-0 bg-transparent px-5 py-0 md:px-6"
        headerRowClassName="flex-row items-baseline gap-4"
        headerAction={displayDate ? (
          <span className="text-sm font-bold tabular-nums tracking-[0.08em] text-slate-500">
            {displayDate}
          </span>
        ) : null}
        bodyClassName="px-0 py-4 md:px-0 md:py-5"
      >
        <div className={cx(
          "grid w-full min-w-0 max-w-full gap-4 sm:gap-6",
          showDiagnostic ? "lg:grid-cols-[1.2fr_0.8fr]" : ""
        )}>
          <div className="min-w-0 space-y-5">
            <div className="min-w-0 overflow-hidden rounded-none border border-[#D4AF37]/20 bg-[#050A17]/70 px-0 py-4 shadow-[0_24px_80px_rgba(3,7,18,0.45)] sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 px-4 sm:px-0">
              <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#D4AF37] sm:text-[11px] sm:tracking-[0.24em]">
                <Sparkles size={14} />
                <span className="truncate">今日はどんな日？</span>
              </div>
              <span className={cx("text-4xl font-black tracking-[-0.08em] sm:text-5xl", rankClass)}>
                {rank}
              </span>
            </div>

            <h2 className={cx("break-words px-4 text-2xl font-black leading-tight tracking-[-0.04em] sm:px-0 sm:text-5xl", rankClass)}>
              {data.title}
            </h2>

            <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1 text-[11px] font-bold text-slate-400 sm:gap-2 sm:text-xs">
              {[
                ["daily", "本日の星模様"],
                    ["personal", "本日の重要ポイント"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPersonalReadingTab(value)}
                  className={cx(
                    "min-w-0 rounded-xl px-1 py-2 transition sm:px-3",
                    personalReadingTab === value
                      ? "bg-[#D4AF37] text-[#050A17]"
                      : "hover:bg-white/10 hover:text-slate-100"
                  )}
                >
                  <span className="block truncate">{label}</span>
                </button>
              ))}
            </div>

            {personalReadingTab === "daily" ? (
              <div className="mt-4 min-h-[4.5rem] rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-4 text-sm font-semibold leading-7 text-slate-400">
                {dailyStarVibe}
              </div>
            ) : hasAspectHighlights ? (
              <PersonalAspectHighlights positive={positiveHighlights} negative={negativeHighlights} />
            ) : personalBody && (
              <div className="mt-6 border-l border-[#D4AF37]/25 pl-4 sm:pl-5">
                <p className="break-words text-sm font-light leading-7 text-slate-300 sm:text-base sm:leading-8">
                  {personalBody}
                </p>
              </div>
            )}
                {developerMode ? (
                 <PersonalReadingDeveloperBlock data={data} meta={developerMeta.personalReading} className="bg-white/95" />
                ) : null}
              </div>
            </div>

        {showDiagnostic ? (
        <div className="min-w-0 space-y-4">
        <div className="min-w-0 overflow-hidden rounded-none border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-4 sm:p-6">
          <div className="mb-5 flex items-start gap-3 sm:items-center">
            <div className="shrink-0 rounded-2xl bg-[#D4AF37]/15 p-3 text-[#D4AF37]">
              <Gauge size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-100">Diagnostic</p>
              <p className="break-words text-xs leading-5 text-slate-500">ロジック安定指標</p>
            </div>
          </div>

            <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                  {diagnostic?.statusLabel || "Diagnostic"}
                </span>
              <span className="text-lg font-black text-amber-300">{Number(diagnostic?.score ?? 0)}%</span>
            </div>
            {diagnostic?.summary && <p className="text-xs leading-5 text-slate-400">{diagnostic.summary}</p>}
              {diagnostic?.primaryFactor?.title && (
                <p className="mt-2 text-xs leading-5 text-slate-300">主要因: {diagnostic.primaryFactor.title}</p>
              )}
            </div>
            {developerMode ? (
              <DeveloperBlock
                title="総合判定の根拠"
                meta={developerMeta.diagnostic}
                className="mb-4 mt-0 bg-white"
              />
            ) : null}

            {diagnosticItems.map((item) => (
              <div
                key={item.label}
                className="group relative mb-4 min-w-0"
                tabIndex={item.description ? 0 : undefined}
              >
                <div className="mb-2 flex flex-col gap-1 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                  <span className="break-words pr-2 leading-5">{item.label}</span>
                  <span className="shrink-0 font-semibold text-slate-300">{Number(item.value || 0)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#D4AF37] to-amber-200"
                  style={{ width: `${Number(item.value || 0)}%` }}
                />
              </div>
                {item.description && (
                  <div className="pointer-events-none absolute left-0 top-full z-40 mt-2 max-w-[280px] rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-[11px] font-medium leading-5 text-slate-200 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus:opacity-100">
                    {item.description}
                  </div>
                )}
                {developerMode ? (
                  <DeveloperBlock
                    title={`${item.label} の根拠`}
                    meta={diagnosticEntries.find((entry) => entry.label === item.label)}
                    className="mt-3 bg-white"
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>
        ) : null}
        </div>
      </Panel>
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
  const percent = Math.max(0, Math.min(100, Math.round(totalDays > 0 ? ((totalDays - daysRemaining) / totalDays) * 100 : 0)));
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
  const elapsedDays = Math.max(0, totalDays - daysRemaining);
  const progressLabel = `進行度 ${elapsedDays}/${totalDays || 0}日 (${percent}%)`;
  const note = String(activeSlide.note || '').trim();
  const titleText = String(activeSlide.title || activeSlide.fallback_label || 'アスペクト').trim();
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
            <h3 className="text-base font-semibold leading-6 text-slate-300">{titleText}</h3>
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
                  <span className="text-base text-slate-500 sm:text-lg">日</span>
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
                  <span className="text-base text-slate-500 sm:text-lg">日</span>
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
                  <span className="text-base text-slate-500 sm:text-lg">日</span>
                </div>
                <span className="text-sm font-semibold leading-5 text-slate-300 sm:text-base">
                  影響下/現在離脱中
                </span>
              </div>
            ) : (
              <>
                <span className="text-base text-slate-500 sm:text-lg">{countdownPrefix}</span>
                <span className="text-4xl font-bold tracking-tighter text-white sm:text-5xl">
                  {displayedDays}
                </span>
                <span className="text-base text-slate-500 sm:text-lg">日</span>
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
  const target = slide.target || {};
  return [
    slide.countdown_id || slide.trigger_id || "",
    target.T_Planet || slide.t_planet || "",
    target.N_Planet || slide.n_planet || "",
    target.Aspect_Angle || slide.aspect_angle || "",
    slide.countdown_mode || "",
  ].join("|");
}

function isTransitMoonCountdown(slide) {
  const target = slide?.target || {};
  const planet = String(target.T_Planet || slide?.t_planet || slide?.transit_planet || "").trim().toUpperCase();
  return planet.replace(/^TRANSIT_/, "") === "MOON";
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
      ? groups.short.filter((slide) => !isTransitMoonCountdown(slide))
      : Array.isArray(groups?.legacy_short) && groups.legacy_short.length
        ? groups.legacy_short.filter((slide) => !isTransitMoonCountdown(slide))
        : data && !isTransitMoonCountdown(data)
          ? [data]
          : Array.isArray(items) && items.length
            ? items.filter((slide) => !isTransitMoonCountdown(slide)).slice(0, 1)
            : [];
  const longSlides =
    groups?.long_by_priority && Array.isArray(groups.long_by_priority[longPriority])
      ? groups.long_by_priority[longPriority].filter((slide) => !isTransitMoonCountdown(slide))
      : Array.isArray(groups?.long) && groups.long.length
      ? groups.long.filter((slide) => !isTransitMoonCountdown(slide))
      : Array.isArray(groups?.legacy_long) && groups.legacy_long.length
        ? groups.legacy_long.filter((slide) => !isTransitMoonCountdown(slide))
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
function formatTimelineDate(value) {
  const date = new Date(`${value || ""}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || "";
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function Timeline({ data, date, days = [], developerMode = false, developerMeta = {} }) {
  const timelineDays = Array.isArray(days) && days.length
    ? days
    : [{ date, timeline: Array.isArray(data) && data.length ? data : dashboardData.timeline }];
  const initialDate = date || timelineDays[1]?.date || timelineDays[0]?.date || "";
  const [activeDate, setActiveDate] = useState(initialDate);
  const activeDay = timelineDays.find((item) => item.date === activeDate) || timelineDays[0];
  const slots = Array.isArray(activeDay?.timeline) && activeDay.timeline.length
    ? activeDay.timeline
    : Array.isArray(data) && data.length
      ? data
      : dashboardData.timeline;
  const slotEntries = Array.isArray(developerMeta.sources) ? developerMeta.sources : [];

  return (
      <Panel
        title="リソース最適化・タイムライン"
        eyebrow="Work / Action"
        bodyClassName="!px-0 py-5 md:!px-0 md:py-6"
        headerAction={
          timelineDays.length ? (
            <div className="grid grid-cols-3 gap-1 rounded-full border border-slate-200 bg-slate-50 p-1 text-xs font-bold text-slate-500">
              {timelineDays.map((item) => {
                const isActive = item.date === activeDay?.date;
                return (
                  <button
                    key={item.date}
                    type="button"
                    onClick={() => setActiveDate(item.date)}
                    className={cx(
                      "rounded-full transition-colors",
                      isActive
                        ? "bg-white px-3 py-1.5 text-xs text-[#0A192F] shadow-sm"
                        : "px-2 py-1 text-[10px] text-slate-400 hover:bg-white/70 hover:text-[#0A192F]"
                    )}
                  >
                    {formatTimelineDate(item.date)}
                  </button>
                );
              })}
            </div>
          ) : null
        }
      >
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto xl:grid xl:grid-cols-4 xl:overflow-visible">
          {slots.map((slot) => {
            const score = Math.max(0, Math.min(100, Number(slot.score) || 0));
            const title = slot.title || slot.phase || slot.recommendation || "Action Timing";
            const timelineAspects = Array.isArray(slot.timelineAspects) && slot.timelineAspects.length
              ? slot.timelineAspects
              : [{
                  planetLabel: slot.sourceAspect?.t_planet || "",
                  timelineLabel: slot.timelineLabel || "",
                  recommendedAction: slot.recommendedAction || slot.recommendation || "",
                  description: slot.description || slot.detail || "",
                }];
            const recommendedAction = timelineAspects
              .map((aspect) => aspect.recommendedAction)
              .filter(Boolean)
              .join(" / ");
            const isPeak = score >= 80;
            const developerEntry = activeDay?.date === date ? slotEntries.find((entry) => entry.slot === slot.label) : null;

            return (
            <article
              key={`${slot.label}-${title}`}
            className={cx(
              "w-[calc(100%-40px)] shrink-0 snap-start rounded-3xl border p-5 transition-all duration-500 xl:w-auto",
              isPeak
                ? "border-amber-300/40 bg-amber-500/20 shadow-[0_18px_50px_rgba(217,174,74,0.18)]"
                : "border-slate-200 bg-gradient-to-b from-white to-[#f7fafc]"
            )}
            title={recommendedAction}
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={cx(
                    "rounded-2xl p-3",
                    isPeak ? "bg-amber-400/20 text-amber-700" : "bg-[#0A192F]/5 text-[#0A192F]"
                  )}
                >
                  <Clock3 size={18} />
                </div>
                <div>
                  <p className="text-sm font-extrabold tracking-wide text-[#0A192F]">{slot.label}</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {title}
                  </p>
                </div>
              </div>
              <span className="text-2xl font-extrabold text-[#D4AF37]">{score}%</span>
            </div>

            <div className="mb-4 h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#203a59] via-[#355d87] to-[#D4AF37] transition-all duration-700 ease-out"
                style={{ width: `${score}%` }}
              />
            </div>

              <div className="space-y-3">
                {timelineAspects.map((aspect, aspectIndex) => {
                  const aspectKey = `${aspect.planet || aspect.planetLabel || "aspect"}-${aspect.sourceAspect?.n_planet || aspectIndex}-${aspect.sourceAspect?.angle || aspectIndex}`;
                  const aspectDescription = aspect.description || "";
                  return (
                    <div key={aspectKey} className="rounded-2xl border border-slate-200 bg-white/70 px-3 py-3">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {aspect.planetLabel ? (
                          <span className="rounded-full bg-[#D4AF37]/15 px-2.5 py-1 text-[11px] font-extrabold text-[#8a6a08]">
                            {aspect.planetLabel}
                          </span>
                        ) : null}
                        {aspect.timelineLabel ? (
                          <span className="rounded-full bg-[#0A192F]/5 px-3 py-1 text-xs font-bold text-[#0A192F]">
                            {aspect.timelineLabel}
                          </span>
                        ) : null}
                      </div>
                      {aspect.recommendedAction ? (
                        <p className="text-sm leading-7 text-slate-600">{aspect.recommendedAction}</p>
                      ) : null}
                      {aspectDescription ? (
                        <details className="mt-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2">
                          <summary className="cursor-pointer text-xs font-bold text-[#0A192F]">
                            アスペクト
                          </summary>
                          <p className="mt-2 text-sm leading-7 text-slate-600">{aspectDescription}</p>
                        </details>
                      ) : null}
                    </div>
                  );
                })}
              </div>
                {developerMode ? <TimelineDeveloperBlock entry={developerEntry} slot={slot} /> : null}
              </article>
              );
            })}
        </div>
      </Panel>
    );
  }

function TopicGrid({ data, developerMode = false, developerMeta = {} }) {
  const palette = {
    gold: "bg-[#D4AF37]/14 text-[#D4AF37] border-[#D4AF37]/30",
    navy: "bg-[#0A192F]/8 text-[#0A192F] border-[#0A192F]/15",
    signal: "bg-[#8FB8D8]/16 text-[#31577A] border-[#8FB8D8]/35",
  };

  return (
    <section className="rounded-3xl border border-slate-200/90 bg-white/95 shadow-[0_18px_36px_rgba(10,25,47,0.08)] backdrop-blur-sm">
      <div className="border-b border-slate-200/90 px-5 py-4 md:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
              Category Focus
            </p>
            <h2 className="text-lg font-bold text-[#0A192F] md:text-xl">トピック強化カード</h2>
          </div>
        </div>
      </div>
      <div className="px-0 py-5 md:px-0 md:py-6">
        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto xl:grid xl:grid-cols-3 xl:overflow-visible">
          {data.map((topic) => {
            const Icon = topic.icon || BriefcaseBusiness;
            const body = topic.body || topic.description || "";
            return (
              <article key={topic.title} className="w-[calc(100%-40px)] shrink-0 snap-start rounded-3xl border border-slate-200 bg-white p-5 xl:w-auto">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{topic.caption}</p>
                    <h3 className="mt-2 text-xl font-bold text-[#0A192F]">{topic.title}</h3>
                  </div>
                  <div className={cx("rounded-2xl border p-3", palette[topic.tone])}>
                    <Icon size={20} />
                  </div>
                </div>
                <div className="mb-4 flex items-end gap-2">
                  <span className="text-4xl font-extrabold text-[#0A192F]">{topic.value}</span>
                </div>
                <p className="text-sm leading-7 text-slate-600">{body}</p>
                {developerMode ? (
                  <DeveloperBlock
                    title={`${topic.title} の根拠`}
                    meta={(developerMeta.sources || []).find((entry) => entry.topic === topic.title)}
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
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

function MobileExpandedPanel({ panel, onClose, children, flush = false }) {
  useEffect(() => {
    if (!panel) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [panel]);

  if (!panel) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] bg-white text-[#0A192F] md:hidden">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-secondary">{panel.eyebrow}</p>
            <h2 className="mt-2 truncate font-notoSerif text-2xl font-normal text-primary">{panel.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0A192F] shadow-sm"
          >
            <X size={18} />
          </button>
        </div>
        <div className={cx("min-h-0 flex-1 overflow-y-auto", flush ? "px-0 py-0" : "px-3 py-4")}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

function MobilePersonalPanel({ data, developerMode, developerMeta }) {
  const [personalReadingTab, setPersonalReadingTab] = useState("daily");
  const personalBody = String(data.summary || "").trim();
  const dailyStarVibe = String(data.dailyStarVibe || data.daily_star_vibe || "").trim();
  const aspectHighlights = data.aspectHighlights || data.aspect_highlights || {};
  const positiveHighlights = Array.isArray(aspectHighlights.positive) ? aspectHighlights.positive.slice(0, 2) : [];
  const negativeHighlights = Array.isArray(aspectHighlights.negative) ? aspectHighlights.negative.slice(0, 2) : [];
  const hasAspectHighlights = positiveHighlights.length > 0 || negativeHighlights.length > 0;

  return (
    <div className="rounded-3xl border border-[#D4AF37]/20 bg-[#050A17] p-4 text-slate-100 shadow-[0_18px_44px_rgba(3,7,18,0.28)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="inline-flex min-w-0 items-center gap-2 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#D4AF37]">
          <Sparkles size={14} />
          <span className="truncate">今日はどんな日？</span>
        </div>
        <span className="text-4xl font-black tracking-[-0.08em] text-[#D4AF37]">{data.rank || "B"}</span>
      </div>
      <h2 className="break-words text-2xl font-black leading-tight text-[#D4AF37]">{data.title}</h2>
      <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1 text-[11px] font-bold text-slate-400">
        {[
          ["daily", "本日の星模様"],
                    ["personal", "本日の重要ポイント"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setPersonalReadingTab(value)}
            className={cx(
              "rounded-xl px-2 py-2 transition",
              personalReadingTab === value ? "bg-[#D4AF37] text-[#050A17]" : "hover:bg-white/10 hover:text-slate-100"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {personalReadingTab === "daily" ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-4 text-sm font-semibold leading-7 text-slate-400">
          {dailyStarVibe}
        </div>
      ) : hasAspectHighlights ? (
        <PersonalAspectHighlights positive={positiveHighlights} negative={negativeHighlights} />
      ) : personalBody ? (
        <p className="mt-4 text-sm font-light leading-7 text-slate-300">{personalBody}</p>
      ) : null}
      {developerMode ? (
        <PersonalReadingDeveloperBlock data={data} meta={developerMeta.personalReading} className="mt-4 bg-white/95" />
      ) : null}
    </div>
  );
}

function MobileDiagnosticPanel({ diagnostic, developerMode, developerMeta }) {
  const resolvedDiagnostic = diagnostic || dashboardData.diagnostic;
  const diagnosticItems =
    Array.isArray(resolvedDiagnostic?.items) && resolvedDiagnostic.items.length
      ? resolvedDiagnostic.items
      : dashboardData.diagnostic.items;
  const diagnosticEntries = Array.isArray(developerMeta?.diagnostic?.entries)
    ? developerMeta.diagnostic.entries
    : [];

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_14px_34px_rgba(10,25,47,0.10)]">
      <div className="mb-5 flex items-start gap-3">
        <div className="shrink-0 rounded-2xl bg-[#D4AF37]/15 p-3 text-[#D4AF37]">
          <Gauge size={24} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#0A192F]">Diagnostic</p>
          <p className="text-xs leading-5 text-slate-500">ロジック安定指標</p>
        </div>
      </div>
      <div className="mb-4 rounded-2xl border border-slate-200 bg-[#fffaf0] p-3">
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {resolvedDiagnostic?.statusLabel || "Diagnostic"}
          </span>
          <span className="text-lg font-black text-[#D4AF37]">{Number(resolvedDiagnostic?.score ?? 0)}%</span>
        </div>
        {resolvedDiagnostic?.summary ? <p className="text-xs leading-5 text-slate-600">{resolvedDiagnostic.summary}</p> : null}
        {resolvedDiagnostic?.primaryFactor?.title ? (
          <p className="mt-2 text-xs leading-5 text-slate-700">主要因: {resolvedDiagnostic.primaryFactor.title}</p>
        ) : null}
      </div>
      {developerMode ? (
        <DeveloperBlock title="総合判定の根拠" meta={developerMeta.diagnostic} className="mb-4 mt-0 bg-white" />
      ) : null}
      {diagnosticItems.map((item) => (
        <div key={item.label} className="mb-4 min-w-0">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-500">
            <span className="break-words pr-2 leading-5">{item.label}</span>
            <span className="shrink-0 font-semibold text-slate-700">{Number(item.value || 0)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#D4AF37] to-amber-200"
              style={{ width: `${Number(item.value || 0)}%` }}
            />
          </div>
          {item.description ? <p className="mt-2 text-[11px] leading-5 text-slate-500">{item.description}</p> : null}
          {developerMode ? (
            <DeveloperBlock
              title={`${item.label} の根拠`}
              meta={diagnosticEntries.find((entry) => entry.label === item.label)}
              className="mt-3 bg-white"
            />
          ) : null}
        </div>
      ))}
    </div>
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

function MobileYearlyCompact({ forecast }) {
  const data = Array.isArray(forecast?.yearly_data) ? forecast.yearly_data : [];
  const selectedIndex = mobileForecastSelectedIndex(forecast);
  const selectedDay = data[selectedIndex] || data[0] || {};
  const score = Number(selectedDay?.scores?.total ?? 0);
  const windowStart = Math.max(0, selectedIndex - 18);
  const visibleData = data.slice(windowStart, Math.min(data.length, windowStart + 37));
  const width = 220;
  const height = 110;
  const pad = 18;
  const scoreColors = {
    total: "#4F53B8",
    general: "#2F9E68",
    work: "#2F6FED",
    love: "#D84C8B",
    money: "#D4AF37",
  };
  const pathFor = (key) => visibleData
    .map((day, index) => {
      const x = visibleData.length <= 1 ? pad : pad + (index / (visibleData.length - 1)) * (width - pad * 2);
      const value = Math.max(-100, Math.min(100, Number(day?.scores?.[key] ?? 0)));
      const y = pad + ((100 - value) / 200) * (height - pad * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const selectedVisibleIndex = Math.max(0, selectedIndex - windowStart);
  const selectedX =
    visibleData.length <= 1 ? pad : pad + (selectedVisibleIndex / Math.max(1, visibleData.length - 1)) * (width - pad * 2);

  if (!data.length) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl bg-white/60 text-center text-xs font-bold text-slate-500">
        年運データなし
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col justify-between">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-black text-[#0A192F]">運勢スコア</p>
        <p className="text-2xl font-black leading-none text-[#4F53B8]">
          {formatYearlyScore(score)}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-500">{selectedDay.date}</p>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {[
            ["全般・健康", "general"],
            ["仕事", "work"],
            ["恋愛・対人", "love"],
            ["お金", "money"],
          ].map(([label, key]) => (
            <div key={key} className="rounded-xl bg-[#fbf5df] px-2 py-2">
              <p className="truncate text-[9px] font-black text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-black leading-none" style={{ color: scoreColors[key] }}>
                {formatYearlyScore(selectedDay?.scores?.[key])}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 min-h-0 flex-1 rounded-2xl bg-[#fffdf8]">
        <svg className="h-full w-full overflow-visible" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`} aria-label="2026 score chart">
          <rect x={pad} y={pad} width={width - pad * 2} height={(height - pad * 2) / 2} fill="#e8f5ed" opacity="0.7" />
          <rect x={pad} y={height / 2} width={width - pad * 2} height={(height - pad * 2) / 2} fill="#fdeceb" opacity="0.7" />
          <line x1={pad} x2={width - pad} y1={height / 2} y2={height / 2} stroke="#d7d9d2" strokeWidth="1" />
          {["total", "general", "work", "love", "money"].map((key) => (
            <path
              key={key}
              d={pathFor(key)}
              fill="none"
              stroke={scoreColors[key]}
              strokeWidth={key === "total" ? "2.8" : "2"}
              strokeDasharray={key === "total" ? "8 6" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={key === "total" ? "1" : "0.85"}
            />
          ))}
          <line x1={selectedX} x2={selectedX} y1={pad} y2={height - pad} stroke="#0A192F" strokeWidth="1.2" />
        </svg>
      </div>
    </div>
  );
}

function MobileCountdownCompact({ data, items = [], groups = {} }) {
  const candidates = [
    ...(Array.isArray(groups?.short) ? groups.short : []),
    ...(Array.isArray(groups?.legacy_short) ? groups.legacy_short : []),
    ...(data ? [data] : []),
    ...(Array.isArray(items) ? items : []),
  ].filter((item) => item && !isTransitMoonCountdown(item));
  const hasFutureCountdown = (candidate) => {
    const candidateScanStatus = String(candidate?.scan_status || candidate?.scan?.scan_status || "").trim();
    const candidateIsNegative = String(candidate?.countdown_mode || "").trim().toLowerCase() === "departure";
    const candidateIsAfterPeak =
      !candidateIsNegative &&
      (candidateScanStatus === "turning_away" || candidateScanStatus === "retrograde_turning_away");
    const candidateDays = Number(candidate?.days_remaining ?? candidate?.daysLeft ?? candidate?.exit_days_remaining ?? candidate?.departure_days_remaining);
    return Number.isFinite(candidateDays) && candidateDays > 0 && !candidateIsAfterPeak;
  };
  const slide =
    candidates.find(hasFutureCountdown) ||
    candidates.find((candidate) => Number(candidate?.days_remaining ?? candidate?.daysLeft ?? candidate?.exit_days_remaining ?? candidate?.departure_days_remaining) > 0) ||
    candidates[0] ||
    null;
  const daysRemaining = Number(slide?.days_remaining ?? slide?.daysLeft ?? 0);
  const totalDays = Number(slide?.total_days ?? slide?.totalDays ?? 0);
  const rawOrbPercent = slide?.orb_percent ?? slide?.orbPercent ?? slide?.scan?.orb_percent;
  const currentOrbValue = Number(
    slide?.current_orb ??
    slide?.currentOrb ??
    slide?.scan?.current_orb ??
    slide?.target?._input?.orb ??
    slide?.target?._input?.orb_diff ??
    slide?.target?.orb ??
    slide?.target?.Orb
  );
  const thresholdOrbValue = Number(slide?.threshold_orb ?? slide?.thresholdOrb ?? slide?.target?.threshold_orb ?? 5);
  const calculatedOrbPercent =
    Number.isFinite(currentOrbValue) && Number.isFinite(thresholdOrbValue) && thresholdOrbValue > 0
      ? 100 - ((currentOrbValue / thresholdOrbValue) * 100)
      : NaN;
  const orbPercentValue = Number(rawOrbPercent ?? calculatedOrbPercent);
  const isNegativeCountdown = String(slide?.countdown_mode || "").trim().toLowerCase() === "departure";
  const clampedOrbPercent = Number.isFinite(orbPercentValue)
    ? Math.max(0, Math.min(100, Math.round(orbPercentValue)))
    : NaN;
  const basePercent = Math.max(0, Math.min(100, Math.round(totalDays > 0 ? ((totalDays - daysRemaining) / totalDays) * 100 : 0)));
  const departureFallbackPercent = isNegativeCountdown && daysRemaining > 0
    ? Math.max(8, Math.min(100, Math.round((daysRemaining / Math.max(totalDays, daysRemaining, 1)) * 100)))
    : NaN;
  const barPercent = Number.isFinite(clampedOrbPercent) && clampedOrbPercent > 0
    ? clampedOrbPercent
    : Number.isFinite(departureFallbackPercent)
      ? departureFallbackPercent
      : Number(slide?.progress ?? basePercent ?? 48) || 48;
  const scanStatus = String(slide?.scan_status || slide?.scan?.scan_status || "").trim();
  const isRetrogradeTurnaway =
    scanStatus === "retrograde_turning_away" ||
    (scanStatus === "turning_away" && slide?.scan?.peak_retrograde === true);
  const isPositiveAfterPeak =
    !isNegativeCountdown &&
    (scanStatus === "turning_away" || scanStatus === "retrograde_turning_away");
  const postPeakLabel =
    isPositiveAfterPeak && barPercent >= 67
      ? "ピーク通過"
      : isPositiveAfterPeak && barPercent >= 34
        ? "ピーク通過"
        : "";
  const exitDaysRemaining = Number(slide?.exit_days_remaining ?? slide?.departure_days_remaining ?? slide?.exitDaysRemaining ?? daysRemaining);
  const displayedDays =
    postPeakLabel
      ? 0
      : isPositiveAfterPeak && Number.isFinite(exitDaysRemaining)
        ? Math.max(0, Math.round(exitDaysRemaining))
        : Math.max(0, Math.round(daysRemaining));
  return (
    <div className="flex h-full min-h-0 flex-col justify-between">
      <div>
        <p className="line-clamp-2 text-base font-semibold leading-6 text-slate-300">{slide?.title || slide?.fallback_label || "カウントダウン"}</p>
      </div>
      <div>
        <p className="mt-1 flex items-baseline gap-1 leading-none">
          <span className="text-sm font-bold text-slate-500">あと</span>
          <span className="text-4xl font-bold tracking-tighter text-white">
            {Number.isFinite(displayedDays) ? displayedDays : "--"}
          </span>
          <span className="text-sm font-bold text-slate-500">日</span>
        </p>
        {postPeakLabel ? (
          <p className="mt-1 text-xs font-semibold leading-4 text-slate-300">
            ピーク通過
          </p>
        ) : null}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-700 via-amber-500 to-yellow-300 shadow-[0_0_15px_rgba(245,158,11,0.5)]"
          style={{ width: `${Math.max(0, Math.min(100, Math.round(barPercent)))}%` }}
        />
      </div>
    </div>
  );
}

function MobileTimelineCompact({ data, days = [], date }) {
  const activeDay = Array.isArray(days) && days.length ? days[0] : { date, timeline: data };
  const slot = Array.isArray(activeDay?.timeline) && activeDay.timeline.length
    ? activeDay.timeline[0]
    : Array.isArray(data) && data.length
      ? data[0]
      : null;
  return (
    <div className="flex h-full min-h-0 flex-col justify-between">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Timeline</p>
        <p className="mt-1 line-clamp-2 text-[11px] font-black leading-4 text-[#0A192F]">リソース最適化</p>
      </div>
      <div>
        <p className="truncate text-[9px] font-bold text-slate-500">{activeDay?.date || date || ""}</p>
        <p className="mt-1 line-clamp-4 text-[11px] font-bold leading-4 text-slate-700">
          {slot?.text || slot?.recommendedAction || slot?.label || "タイムライン"}
        </p>
      </div>
    </div>
  );
}

function MobileTopicCompact({ data = [] }) {
  const topic = Array.isArray(data) && data.length ? data[0] : null;
  return (
    <div className="flex h-full min-h-0 flex-col justify-between">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500">Topics</p>
        <p className="mt-1 line-clamp-2 text-[11px] font-black leading-4 text-[#0A192F]">トピック強化カード</p>
      </div>
      <div>
        <p className="line-clamp-3 text-[11px] font-bold leading-4 text-slate-700">{topic?.title || "他のコンテンツ"}</p>
        {topic?.value ? <p className="mt-2 text-2xl font-black leading-none text-[#D4AF37]">{topic.value}</p> : null}
      </div>
    </div>
  );
}

function MobileDashboardWidgets({ data, displayDate, developerMode, developerMeta, layoutMode = "new" }) {
  const [activePanel, setActivePanel] = useState(null);
  const diagnostic = data.diagnostic || data.hero?.diagnostic || dashboardData.diagnostic;
  const forecast = data.yearly_forecast || data.yearlyForecast || null;
  const diagnosticItems =
    Array.isArray(diagnostic?.items) && diagnostic.items.length
      ? diagnostic.items.slice(0, 3)
      : dashboardData.diagnostic.items.slice(0, 3);
  const panels = {
    yearly: { title: "2026運勢シミュレーション", eyebrow: "Yearly Forecast" },
    personal: { title: "Personal Reading", eyebrow: displayDate || "Today Overview" },
    logic: { title: "ロジック安定指標", eyebrow: "Diagnostic" },
    countdown: { title: "カウントダウン", eyebrow: "Countdown" },
    timeline: { title: "リソース最適化・タイムライン", eyebrow: "Timeline" },
    topics: { title: "トピック強化カード", eyebrow: "Topics" },
  };

  if (layoutMode === "old") {
    return (
      <div className="md:hidden">
        <div className="grid min-h-[calc(100svh-116px)] grid-cols-2 grid-rows-2 gap-3 px-3 py-3">
          <button
            type="button"
            onClick={() => setActivePanel("personal")}
            className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#050A17] p-3 text-left text-slate-100 shadow-[0_18px_44px_rgba(3,7,18,0.28)] transition active:scale-[0.99]"
          >
            <p className="truncate text-[9px] font-black uppercase tracking-[0.16em] text-white">今日はどんな日？</p>
            <div className="mt-2 flex items-start justify-between gap-2">
              <p className="line-clamp-2 text-sm font-black leading-5 text-[#D4AF37]">{data.hero?.title}</p>
              <span className="shrink-0 text-3xl font-black leading-none text-[#D4AF37]">{data.hero?.rank || "B"}</span>
            </div>
            <div className="mt-auto grid grid-cols-1 gap-1 text-[10px] font-bold text-slate-300">
              <span className="truncate rounded-full border border-white/10 bg-white/[0.06] px-2 py-1">本日の星模様</span>
              <span className="truncate rounded-full border border-white/10 bg-white/[0.06] px-2 py-1">本日の重要ポイント</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActivePanel("logic")}
            className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 text-left text-[#0A192F] shadow-[0_14px_34px_rgba(10,25,47,0.10)] transition active:scale-[0.99]"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="line-clamp-2 text-sm font-black leading-5">ロジック安定指標</p>
              <span className="shrink-0 text-2xl font-black leading-none text-[#D4AF37]">{Number(diagnostic?.score ?? 0)}%</span>
            </div>
            <div className="mt-auto space-y-2">
              {diagnosticItems.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between gap-1 text-[9px] font-bold text-slate-500">
                    <span className="truncate">{item.label}</span>
                    <span>{Number(item.value || 0)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-[#D4AF37]" style={{ width: `${Number(item.value || 0)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActivePanel("timeline")}
            className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 text-left text-[#0A192F] shadow-[0_14px_34px_rgba(10,25,47,0.10)] transition active:scale-[0.99]"
          >
            <MobileTimelineCompact data={data.timeline} date={data.timelineDate} days={data.timelineDays} />
          </button>

          <button
            type="button"
            onClick={() => setActivePanel("topics")}
            className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 text-left text-[#0A192F] shadow-[0_14px_34px_rgba(10,25,47,0.10)] transition active:scale-[0.99]"
          >
            <MobileTopicCompact data={data.topics} />
          </button>
        </div>

        <MobileExpandedPanel panel={activePanel ? panels[activePanel] : null} onClose={() => setActivePanel(null)}>
          {activePanel === "personal" ? (
            <TypographicHero
              data={data.hero}
              diagnosticData={data.diagnostic}
              planetMotion={data.planetMotion}
              retrogradeCalendar={data.retrogradeCalendar}
              displayDate={displayDate}
              developerMode={developerMode}
              developerMeta={developerMeta}
            />
          ) : null}
          {activePanel === "logic" ? <DiagnosticPanel data={diagnostic} /> : null}
          {activePanel === "timeline" ? (
            <Timeline
              data={data.timeline}
              date={data.timelineDate}
              days={data.timelineDays}
              developerMode={developerMode}
              developerMeta={developerMeta.timeline || {}}
            />
          ) : null}
          {activePanel === "topics" ? (
            <TopicGrid
              data={data.topics}
              developerMode={developerMode}
              developerMeta={developerMeta.topics || {}}
            />
          ) : null}
        </MobileExpandedPanel>
      </div>
    );
  }

  return (
    <div className="md:hidden">
      <div className="grid min-h-[calc(100svh-116px)] grid-cols-4 grid-rows-4 gap-3 px-3 py-3">
        <button
          type="button"
          onClick={() => setActivePanel("yearly")}
          className="col-span-2 row-span-2 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 text-left text-[#0A192F] shadow-[0_14px_34px_rgba(10,25,47,0.10)] transition active:scale-[0.99]"
        >
          <MobileYearlyCompact forecast={forecast} />
        </button>

        <button
          type="button"
          onClick={() => setActivePanel("personal")}
          className="col-span-2 col-start-3 row-span-1 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#050A17] p-3 text-left text-slate-100 shadow-[0_18px_44px_rgba(3,7,18,0.28)] transition active:scale-[0.99]"
        >
          <p className="truncate text-[9px] font-black uppercase tracking-[0.16em] text-white">今日はどんな日？</p>
          <div className="mt-2 flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-black leading-5 text-[#D4AF37]">{data.hero?.title}</p>
            <span className="shrink-0 text-3xl font-black leading-none text-[#D4AF37]">{data.hero?.rank || "B"}</span>
          </div>
          <div className="mt-auto grid grid-cols-1 gap-1 text-[10px] font-bold text-slate-300">
            <span className="truncate rounded-full border border-white/10 bg-white/[0.06] px-2 py-1">本日の星模様</span>
            <span className="truncate rounded-full border border-white/10 bg-white/[0.06] px-2 py-1">本日の重要ポイント</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActivePanel("logic")}
          className="col-span-2 col-start-3 row-start-2 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 text-left text-[#0A192F] shadow-[0_14px_34px_rgba(10,25,47,0.10)] transition active:scale-[0.99]"
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-black leading-5">ロジック安定指標</p>
            <span className="shrink-0 text-2xl font-black leading-none text-[#D4AF37]">{Number(diagnostic?.score ?? 0)}%</span>
          </div>
          <div className="mt-auto space-y-2">
            {diagnosticItems.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex items-center justify-between gap-1 text-[9px] font-bold text-slate-500">
                  <span className="truncate">{item.label}</span>
                  <span>{Number(item.value || 0)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#D4AF37]" style={{ width: `${Number(item.value || 0)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActivePanel("countdown")}
          className="col-span-4 row-start-4 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-3 text-left text-slate-100 shadow-xl transition active:scale-[0.99]"
        >
          <MobileCountdownCompact data={data.countdown} items={data.countdown_items} groups={data.countdown_groups} />
        </button>

        <button
          type="button"
          onClick={() => setActivePanel("timeline")}
          className="col-span-2 row-start-3 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 text-left text-[#0A192F] shadow-[0_14px_34px_rgba(10,25,47,0.10)] transition active:scale-[0.99]"
        >
          <MobileTimelineCompact data={data.timeline} date={data.timelineDate} days={data.timelineDays} />
        </button>

        <button
          type="button"
          onClick={() => setActivePanel("topics")}
          className="col-span-2 col-start-3 row-start-3 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 text-left text-[#0A192F] shadow-[0_14px_34px_rgba(10,25,47,0.10)] transition active:scale-[0.99]"
        >
          <MobileTopicCompact data={data.topics} />
        </button>
      </div>

      <MobileExpandedPanel
        panel={activePanel ? panels[activePanel] : null}
        onClose={() => setActivePanel(null)}
        flush
      >
        {activePanel === "yearly" ? (
          forecast ? (
            <YearlyForecastGraph forecast={forecast} developerMode={developerMode} hideHeader />
          ) : (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-500">
              年運データがありません
            </div>
          )
        ) : null}
        {activePanel === "personal" ? (
          <TypographicHero
            data={data.hero}
            diagnosticData={data.diagnostic}
            planetMotion={data.planetMotion}
            retrogradeCalendar={data.retrogradeCalendar}
            displayDate={displayDate}
            developerMode={developerMode}
            developerMeta={developerMeta}
            showDiagnostic={false}
          />
        ) : null}
        {activePanel === "logic" ? (
          <MobileDiagnosticPanel diagnostic={diagnostic} developerMode={developerMode} developerMeta={developerMeta} />
        ) : null}
        {activePanel === "countdown" ? (
          <LunarCountdownWidget
            data={data.countdown}
            items={data.countdown_items}
            groups={data.countdown_groups}
            developerMode={developerMode}
            developerMeta={developerMeta}
          />
        ) : null}
        {activePanel === "timeline" ? (
          <Timeline
            data={data.timeline}
            date={data.timelineDate}
            days={data.timelineDays}
            developerMode={developerMode}
            developerMeta={developerMeta.timeline || {}}
          />
        ) : null}
        {activePanel === "topics" ? (
          <TopicGrid
            data={data.topics || dashboardData.topics}
            developerMode={developerMode}
            developerMeta={developerMeta.topics || {}}
          />
        ) : null}
      </MobileExpandedPanel>
    </div>
  );
}

export function Dashboard({ data = dashboardData, embedded = false, developerMode = false }) {
  const [mobileLayoutMode, setMobileLayoutMode] = useState(() => {
    if (typeof window === "undefined") return "new";
    return window.localStorage.getItem("celestial-atelier:mobile-layout-mode") === "old" ? "old" : "new";
  });
  const displayDate = formatIsoDate(
    data.readingDate ||
      data.reading_date ||
      data.date ||
      data.timelineDate ||
      data.timelineDays?.[0]?.date ||
      data.yearlyForecast?.reading_date ||
      data.yearly_forecast?.reading_date ||
      data.meta?.reading_date ||
      data.meta?.date
  );
  const forecast = data.yearly_forecast || data.yearlyForecast || null;
  const handleToggleDeveloperMode = () => {
    const url = new URL(window.location.href);
    if (developerMode) {
      url.searchParams.delete("mode");
    } else {
      url.searchParams.set("mode", "developer");
    }
    window.location.href = url.toString();
  };
  const handleSetMobileLayoutMode = (mode) => {
    const nextMode = mode === "old" ? "old" : "new";
    setMobileLayoutMode(nextMode);
    try {
      window.localStorage.setItem("celestial-atelier:mobile-layout-mode", nextMode);
    } catch {
      // Storage is best-effort; layout switching still works for the current session.
    }
  };

  return (
    <>
      <div
        className={cx(
          "w-full max-w-full min-w-0 rounded-none border-0 bg-transparent shadow-none backdrop-blur-0",
          "overflow-x-hidden overflow-y-visible",
          embedded ? "" : "min-h-screen"
        )}
      >
        <Header
          data={data.header}
          embedded={embedded}
          developerMode={developerMode}
          onToggleDeveloperMode={handleToggleDeveloperMode}
          mobileLayoutMode={mobileLayoutMode}
          onSetMobileLayoutMode={handleSetMobileLayoutMode}
          planetMotion={data.planetMotion}
          retrogradeCalendar={data.retrogradeCalendar}
        />
        <main className={cx(
          "min-w-0 max-w-full flex-col gap-6 overflow-x-hidden",
          mobileLayoutMode === "old" ? "flex" : "hidden md:flex",
          embedded ? "px-0 py-4 md:px-0 md:py-5" : "px-0 py-4 md:px-0 md:py-5"
        )}>
          <TypographicHero
            data={data.hero}
            diagnosticData={data.diagnostic}
            planetMotion={data.planetMotion}
            retrogradeCalendar={data.retrogradeCalendar}
            displayDate={displayDate}
            developerMode={developerMode}
            developerMeta={data.developerMeta || dashboardData.developerMeta}
          />
          {mobileLayoutMode === "old" && forecast ? (
            <div className="md:hidden">
              <YearlyForecastGraph forecast={forecast} developerMode={developerMode} />
            </div>
          ) : null}
          <Timeline
            data={data.timeline}
            date={data.timelineDate}
            days={data.timelineDays}
            developerMode={developerMode}
            developerMeta={(data.developerMeta || dashboardData.developerMeta).timeline || {}}
          />
          <TopicGrid
            data={data.topics}
            developerMode={developerMode}
            developerMeta={(data.developerMeta || dashboardData.developerMeta).topics || {}}
          />
          <LunarCountdownWidget
            data={data.countdown}
            items={data.countdown_items}
            groups={data.countdown_groups}
            developerMode={developerMode}
            developerMeta={data.developerMeta || dashboardData.developerMeta}
          />
        </main>
        {mobileLayoutMode === "new" ? (
          <MobileDashboardWidgets
            data={data}
            displayDate={displayDate}
            developerMode={developerMode}
            developerMeta={data.developerMeta || dashboardData.developerMeta}
            layoutMode={mobileLayoutMode}
          />
        ) : null}
      </div>
    </>
  );
}






