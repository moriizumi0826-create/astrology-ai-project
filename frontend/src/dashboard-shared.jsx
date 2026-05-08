import React, { useEffect, useState } from "react";
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
    { planet: "MERCURY", label: "水星", status: "direct" },
    { planet: "VENUS", label: "金星", status: "direct" },
    { planet: "MARS", label: "火星", status: "direct" },
    { planet: "JUPITER", label: "木星", status: "direct" },
    { planet: "SATURN", label: "土星", status: "direct" },
    { planet: "URANUS", label: "天王星", status: "direct" },
    { planet: "NEPTUNE", label: "海王星", status: "stationary" },
    { planet: "PLUTO", label: "冥王星", status: "retrograde" },
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

function Panel({ title, eyebrow, children, className, headerAction }) {
  return (
    <section
      className={cx(
        "rounded-3xl border border-slate-200/90 bg-white/95 shadow-[0_18px_36px_rgba(10,25,47,0.08)] backdrop-blur-sm",
        className
      )}
    >
      <div className="border-b border-slate-200/90 px-5 py-4 md:px-6">
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-lg font-bold text-[#0A192F] md:text-xl">{title}</h2>
          {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
        </div>
      </div>
      <div className="px-5 py-5 md:px-6 md:py-6">{children}</div>
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

function Header({ data: header, embedded = false, developerMode = false, onToggleDeveloperMode }) {
  return (
    <header
      className={cx(
        "border-b border-slate-200/90 bg-[#f8fafc]/80 backdrop-blur-xl",
        embedded ? "rounded-t-[28px]" : "sticky top-0 z-30"
      )}
    >
      <div className="flex flex-col items-start gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
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

          <nav className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {header.actions.map((action, index) => {
              const iconMap = [History, UserCircle2, Crown];
              const Icon = iconMap[index] || UserCircle2;
              return (
              <button
                key={action}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#0A192F] transition hover:border-[#D4AF37] hover:text-[#D4AF37] sm:px-4 sm:text-sm"
                type="button"
              >
                <Icon size={16} />
                <span>{action}</span>
                </button>
              );
            })}
            <button
              className={cx(
                "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm",
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

function MotionDot({ status }) {
  const style = MOTION_STATUS_STYLES[status] || MOTION_STATUS_STYLES.direct;
  return (
    <span
      aria-hidden="true"
      className={cx("inline-block h-2.5 w-2.5 shrink-0 rounded-full", style.dot)}
    />
  );
}

function PlanetMotionPanel({ items = [] }) {
  const motionItems = Array.isArray(items) ? items : [];
  if (!motionItems.length) return null;

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-bold text-slate-300">
        {Object.entries(MOTION_STATUS_STYLES).map(([status, style]) => (
          <span key={status} className="inline-flex items-center gap-2">
            <MotionDot status={status} />
            {style.label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
        {motionItems.map((item) => (
          <div
            key={item.planet || item.label}
            className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-200"
            title={MOTION_STATUS_STYLES[item.status]?.label || MOTION_STATUS_STYLES.direct.label}
          >
            <MotionDot status={item.status} />
            <span className="truncate">{item.label || item.planet}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function TypographicHero({
  data,
  diagnosticData,
  planetMotion = [],
  developerMode = false,
  developerMeta = {},
}) {
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
    const diagnostic = diagnosticData || data.diagnostic || dashboardData.diagnostic;
    const diagnosticItems =
      Array.isArray(diagnostic?.items) && diagnostic.items.length
        ? diagnostic.items
        : dashboardData.diagnostic.items;
    const diagnosticEntries = Array.isArray(developerMeta?.diagnostic?.entries)
      ? developerMeta.diagnostic.entries
      : [];

  return (
      <Panel title="ユーザーステータス" eyebrow="Today Overview" className="overflow-hidden">
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <div className="rounded-[2rem] border border-[#D4AF37]/20 bg-[#050A17]/70 p-4 shadow-[0_24px_80px_rgba(3,7,18,0.45)] sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#D4AF37] sm:text-[11px] sm:tracking-[0.24em]">
                <Sparkles size={14} />
                <span className="truncate">Personal Reading</span>
              </div>
              <span className={cx("text-4xl font-black tracking-[-0.08em] sm:text-5xl", rankClass)}>
                {rank}
              </span>
            </div>

            <h2 className={cx("break-words text-2xl font-black leading-tight tracking-[-0.04em] sm:text-5xl", rankClass)}>
              {data.title}
            </h2>

            {personalBody && (
              <div className="mt-6 border-l border-[#D4AF37]/25 pl-4 sm:pl-5">
                <p className="break-words text-sm font-light leading-7 text-slate-300 sm:text-base sm:leading-8">
                  {personalBody}
                </p>
              </div>
            )}

              <PlanetMotionPanel items={planetMotion} />

                {developerMode ? (
                 <PersonalReadingDeveloperBlock data={data} meta={developerMeta.personalReading} className="bg-white/95" />
                ) : null}
              </div>
            </div>

        <div className="min-w-0 rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-4 sm:p-6">
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
              <div key={item.label} className="mb-4 min-w-0">
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
                  <p className="mt-2 break-words text-[11px] leading-5 text-slate-500">{item.description}</p>
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
      </Panel>
    );
  }
function CountdownLane({
  title,
  slides,
  activeIndex,
  setActiveIndex,
  maxSlides = 6,
  headerAction = null,
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
  const elapsedDays = Math.max(0, totalDays - daysRemaining);
  const progressLabel = `進行度 ${elapsedDays}/${totalDays || 0}日 (${percent}%)`;
  const note = String(activeSlide.note || '').trim();
  const titleText = String(activeSlide.title || activeSlide.fallback_label || 'アスペクト').trim();
  const aspectLabel = String(activeSlide.aspect_label || '').trim();
  const isNegativeCountdown = String(activeSlide.countdown_mode || '').trim().toLowerCase() === 'departure';
  const scanStatus = String(activeSlide.scan_status || activeSlide.scan?.scan_status || '').trim();
  const isRetrogradeTurnaway =
    scanStatus === 'retrograde_turning_away' ||
    (scanStatus === 'turning_away' && activeSlide.scan?.peak_retrograde === true);
  const countdownPrefix = isRetrogradeTurnaway || scanStatus === 'closest' ? '最接近まで あと' : 'あと';
  const countdownSuffix =
    isRetrogradeTurnaway
      ? '※その後逆行開始により離脱、再び接近する局面を迎えます'
      : '';
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
        style={{ opacity: percent / 100 }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent transition-opacity duration-1000"
        style={{ opacity: percent / 100 }}
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
            <span className="text-right text-sm font-bold text-amber-500">
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

        <div className="mb-3 min-h-[72px]">
          <div className="flex min-h-[68px] min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-base text-slate-500 sm:text-lg">{countdownPrefix}</span>
            <span className="text-4xl font-bold tracking-tighter text-white sm:text-5xl">
              {daysRemaining}
            </span>
            <span className="text-base text-slate-500 sm:text-lg">日</span>
            {countdownSuffix ? (
              <p className="basis-full whitespace-normal break-words text-left text-[10px] font-medium leading-5 text-slate-500">
                {countdownSuffix}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mb-4 h-2 w-full shrink-0 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-700 via-amber-500 to-yellow-300 shadow-[0_0_15px_rgba(245,158,11,0.5)] transition-all duration-1000 ease-out"
            style={{ width: `${percent}%` }}
          />
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
        <CountdownLane title="短期" slides={shortSlides} activeIndex={shortIndex} setActiveIndex={setShortIndex} />
        <CountdownLane
          title="中長期"
          slides={longSlides}
          activeIndex={longIndex}
          setActiveIndex={setLongIndex}
          maxSlides={Infinity}
          headerAction={longPriorityControl}
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
        <div className="grid gap-4 xl:grid-cols-4">
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
              "rounded-3xl border p-5 transition-all duration-500",
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
          <div className="max-w-xl rounded-2xl border border-dashed border-[#D4AF37]/30 bg-[#fffaf0] px-4 py-3">
            <p className="text-xs font-bold text-[#0A192F]">表示条件</p>
            <p className="mt-1 text-xs leading-6 text-slate-600">
              Category ごとに Score_Impact が最も高いアスペクトだけを採用して表示します。
              該当カテゴリの解釈が無い場合、そのカードは表示されません。
            </p>
          </div>
        </div>
      </div>
      <div className="px-5 py-5 md:px-6 md:py-6">
        <div className="grid gap-4 xl:grid-cols-3">
          {data.map((topic) => {
            const Icon = topic.icon || BriefcaseBusiness;
            const body = topic.body || topic.description || "";
            return (
              <article key={topic.title} className="rounded-3xl border border-slate-200 bg-white p-5">
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

export function Dashboard({ data = dashboardData, embedded = false, developerMode = false }) {
  const handleToggleDeveloperMode = () => {
    const url = new URL(window.location.href);
    if (developerMode) {
      url.searchParams.delete("mode");
    } else {
      url.searchParams.set("mode", "developer");
    }
    window.location.href = url.toString();
  };

  return (
    <div
      className={cx(
        "overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/80 shadow-[0_24px_55px_rgba(10,25,47,0.08)] backdrop-blur-xl",
        embedded ? "" : "min-h-screen"
      )}
    >
      <Header
        data={data.header}
        embedded={embedded}
        developerMode={developerMode}
        onToggleDeveloperMode={handleToggleDeveloperMode}
      />
      <main className="flex flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
        <TypographicHero
          data={data.hero}
          diagnosticData={data.diagnostic}
          planetMotion={data.planetMotion}
          developerMode={developerMode}
          developerMeta={data.developerMeta || dashboardData.developerMeta}
        />
        <LunarCountdownWidget
          data={data.countdown}
          items={data.countdown_items}
          groups={data.countdown_groups}
          developerMode={developerMode}
          developerMeta={data.developerMeta || dashboardData.developerMeta}
        />
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
      </main>
    </div>
  );
}






