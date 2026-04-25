import React from "react";
import {
  BatteryMedium,
  BriefcaseBusiness,
  Clock3,
  Crown,
  Gauge,
  History,
  Lock,
  MessageSquareText,
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
    title: "今日の星模様ランク",
    guidance:
      "本日の指針：今は足踏みの時期ですが、システムアップデート（内省）には最適です。",
    summary:
      "短期の突破より、状況の棚卸しと意思決定の基準整備に優位性があります。焦って前へ出るより、土台を揃えるほど明日以降の打率が安定します。",
  },
  countdown: {
    title: "恋愛運・追い風モード突入まで",
    daysLeft: 12,
    totalDays: 21,
    note:
      "金星トランジットの切り替わりで対人の受信感度が上がる想定。今は無理に動かず、対話ログの整理と自己理解の精度向上が有効です。",
  },
  timeline: [
    {
      label: "08:00-12:00",
      score: 84,
      recommendation: "複雑な計算向き",
      detail:
        "判断速度と整合性チェックが噛み合う帯。設計、分析、提案書の骨子づくりに適しています。",
    },
    {
      label: "13:00-17:00",
      score: 61,
      recommendation: "単純作業向き",
      detail:
        "集中の波がやや分散。定型返信、整理、レビュー対応など粒度の揃った作業が安定します。",
    },
    {
      label: "18:00-22:00",
      score: 72,
      recommendation: "対話・振り返り向き",
      detail:
        "感情と言語化がほどよく連動。面談準備、日報、関係調整のメモ作成に向いています。",
    },
  ],
  topics: [
    {
      title: "仕事（生産性）",
      icon: BriefcaseBusiness,
      value: "74%",
      caption: "オペレーション安定度",
      tone: "gold",
      body:
        "水星の配置は“精度と再現性”を優先。DB定型文プレースホルダー：現時点では改善・検証・整流化の判断が成果に直結します。",
    },
    {
      title: "対人バリア（人間関係）",
      icon: Shield,
      value: "60%",
      caption: "バリア強度",
      tone: "navy",
      body:
        "不要な接触を防ぐには十分ですが、強すぎる遮断ではありません。境界線の言語化を先に置くほど摩擦を減らせます。",
    },
    {
      title: "体調（エネルギー）",
      icon: BatteryMedium,
      value: "40%",
      caption: "エネルギー残量",
      tone: "signal",
      body:
        "回復コストが上がりやすい帯。成果を伸ばすより消耗を増やさない配分に切り替える方が、総量では得です。",
    },
  ],
  premium: {
    title: "有料版・AIチャットプレビュー",
    description:
      "有料版ではAIがトランジットとあなたの悩みを掛け合わせ、超パーソナライズ回答を行います。",
    placeholder: "例：今週、仕事と恋愛どちらにリソースを割くべき？",
    preview:
      "現時点では、感情的な手応えを追うよりも“選択基準のメンテナンス”を優先する方が収益性も関係性も安定します。特に午後帯は決断疲れが出やすいため、重要判断は午前の高スコア帯に寄せるのが合理的です。",
  },
};

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function Panel({ title, eyebrow, children, className }) {
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
        <h2 className="text-lg font-bold text-[#0A192F] md:text-xl">{title}</h2>
      </div>
      <div className="px-5 py-5 md:px-6 md:py-6">{children}</div>
    </section>
  );
}

function Header({ data: header, embedded = false }) {
  return (
    <header
      className={cx(
        "border-b border-slate-200/90 bg-[#f8fafc]/80 backdrop-blur-xl",
        embedded ? "rounded-t-[28px]" : "sticky top-0 z-30"
      )}
    >
      <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-6">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0A192F] text-[#D4AF37] shadow-[0_18px_36px_rgba(10,25,47,0.08)]">
            <Sparkles size={20} />
          </div>
          <div>
            <p className="text-base font-extrabold tracking-tight text-[#0A192F]">
              {header.brand.name}
            </p>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              {header.brand.sublabel}
            </p>
          </div>
        </div>

        <nav className="flex flex-wrap items-center justify-end gap-2">
          {header.actions.map((action, index) => {
            const iconMap = [History, UserCircle2, Crown];
            const Icon = iconMap[index] || UserCircle2;
            return (
              <button
                key={action}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-[#0A192F] transition hover:border-[#D4AF37] hover:text-[#D4AF37]"
                type="button"
              >
                <Icon size={16} />
                <span>{action}</span>
              </button>
            );
          })}
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
              ["意思決定の整合性", "88%"],
              ["感情と行動の同期", "63%"],
              ["外部ノイズ耐性", "71%"],
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

function TypographicHero({ data }) {
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
  const summaryParts = String(data.summary || "")
    .split("。")
    .map((part) => part.trim())
    .filter(Boolean);
  const basicPart = summaryParts[0] || data.description || "";
  const aspectPart = summaryParts.slice(1).join("。") || data.guidance || "";

  return (
    <Panel title="ユーザーステータス" eyebrow="Today Overview" className="overflow-hidden">
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5">
          <div className="rounded-[2rem] border border-[#D4AF37]/20 bg-[#050A17]/70 p-6 shadow-[0_24px_80px_rgba(3,7,18,0.45)]">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-[#D4AF37]">
                <Sparkles size={14} />
                Personal Reading
              </div>
              <span className={cx("text-5xl font-black tracking-[-0.08em]", rankClass)}>
                {rank}
              </span>
            </div>

            {data.description && (
              <div className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-4 py-2 text-xs font-semibold text-amber-100 shadow-[0_0_22px_rgba(217,174,74,0.12)]">
                <Gauge size={14} />
                <span className="truncate">{data.description}</span>
              </div>
            )}

            <h2 className={cx("text-3xl font-black leading-tight tracking-[-0.04em] sm:text-5xl", rankClass)}>
              {data.title}
            </h2>

            {data.guidance && (
              <p className="mt-4 max-w-2xl text-lg font-semibold leading-8 text-white sm:text-xl">
                {data.guidance}
              </p>
            )}

            <div className="mt-6 space-y-3 border-l border-[#D4AF37]/25 pl-5">
              {basicPart && (
                <p className="text-slate-400 font-light leading-8">
                  {basicPart}。
                </p>
              )}
              {aspectPart && (
                <p className="inline text-white font-semibold leading-8 border-b border-amber-500/30 pb-1">
                  {aspectPart}
                </p>
              )}
            </div>

            {data.guideline && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
                  <Sparkles size={15} />
                  Atelier Prescription
                </div>
                <p className="text-sm leading-7 text-slate-300">{data.guideline}</p>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-[#D4AF37]/15 p-3 text-[#D4AF37]">
              <Gauge size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-100">Diagnostic</p>
              <p className="text-xs text-slate-500">ロジック安定指標</p>
            </div>
          </div>
          {[
            ["意思決定の整合性", 82],
            ["感情と行動の同期", 68],
            ["外部ノイズ耐性", 74],
          ].map(([label, value]) => (
            <div key={label} className="mb-4">
              <div className="mb-2 flex justify-between text-xs text-slate-400">
                <span>{label}</span>
                <span>{value}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#D4AF37] to-amber-200"
                  style={{ width: `${value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function CountdownWidget({ data }) {
  const progress = Math.max(
    0,
    Math.min(100, ((data.totalDays - data.daysLeft) / data.totalDays) * 100)
  );

  return (
    <Panel title={data.title} eyebrow="Return Hook">
      <div className="grid gap-5 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
        <div className="rounded-3xl bg-[#0A192F] px-6 py-7 text-white">
          <p className="text-sm uppercase tracking-[0.22em] text-white/55">Countdown</p>
          <div className="mt-3 flex items-end gap-3">
            <span className="text-5xl font-extrabold text-[#D4AF37]">{data.daysLeft}</span>
            <span className="pb-2 text-lg font-semibold">日</span>
          </div>
          <p className="mt-4 text-sm leading-6 text-white/70">{data.note}</p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
            <span>追い風モード準備率</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-4 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#D4AF37] via-[#e8c966] to-[#f5e6a8]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm leading-7 text-slate-600">
            期待値を上げすぎず、観測と調整に徹するほど効果的です。再訪のタイミングを作るため、
            進捗が見える設計にしています。
          </p>
        </div>
      </div>
    </Panel>
  );
}

function LunarCountdownWidget({ data }) {
  if (!data) return null;

  const rawPercent =
    typeof data.percent === "number"
      ? data.percent
      : ((data.totalDays - data.daysLeft) / data.totalDays) * 100;
  const percent = Math.max(0, Math.min(100, Math.round(rawPercent || 0)));
  const daysRemaining = data.days_remaining ?? data.daysLeft ?? 0;
  const daysLabel = Number(daysRemaining) === 1 ? "Day to go" : "Days to go";

  return (
    <div className="group relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl md:p-6">
      <div
        className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-amber-500/10 blur-3xl transition-all duration-1000"
        style={{ opacity: percent / 100 }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent transition-opacity duration-1000"
        style={{ opacity: percent / 100 }}
      />

      <div className="relative">
        <h3 className="mb-3 flex items-start justify-between gap-4 text-sm font-medium text-slate-400">
          <span className="leading-6">{data.title}</span>
          <span className="shrink-0 font-bold text-amber-500">{percent}%</span>
        </h3>

        <div className="mb-5 flex items-baseline gap-2">
          <span className="text-4xl font-bold tracking-tighter text-white sm:text-5xl">
            {daysRemaining}
          </span>
          <span className="text-base text-slate-500 sm:text-lg">{daysLabel}</span>
        </div>

        <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-700 via-amber-500 to-yellow-300 shadow-[0_0_15px_rgba(245,158,11,0.5)] transition-all duration-1000 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>

        {data.note ? (
          <p className="text-xs italic leading-relaxed text-slate-400 opacity-80 transition-opacity group-hover:opacity-100">
            {data.note}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Timeline({ data }) {
  const slots = Array.isArray(data) && data.length ? data : dashboardData.timeline;

  return (
    <Panel title="リソース最適化・タイムライン" eyebrow="Work / Action">
      <div className="grid gap-4 xl:grid-cols-4">
        {slots.map((slot) => {
          const score = Math.max(0, Math.min(100, Number(slot.score) || 0));
          const title = slot.title || slot.phase || slot.recommendation || "Action Timing";
          const recommendedAction = slot.recommendedAction || slot.recommendation || "";
          const description = slot.description || slot.detail || "";
          const isPeak = score >= 80;

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
              <p className="inline-flex rounded-full bg-[#0A192F]/5 px-3 py-1 text-sm font-bold text-[#0A192F]">
                {recommendedAction}
              </p>
              <p className="text-sm leading-7 text-slate-600">{description}</p>
            </div>
          </article>
          );
        })}
      </div>
    </Panel>
  );
}

function TopicGrid({ data }) {
  const palette = {
    gold: "bg-[#D4AF37]/14 text-[#D4AF37] border-[#D4AF37]/30",
    navy: "bg-[#0A192F]/8 text-[#0A192F] border-[#0A192F]/15",
    signal: "bg-[#8FB8D8]/16 text-[#31577A] border-[#8FB8D8]/35",
  };

  return (
    <Panel title="トピック別カード" eyebrow="Category Focus">
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
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

function PremiumPreview({ data }) {
  return (
    <Panel title={data.title} eyebrow="Conversion Path">
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-1.5 text-sm font-semibold text-[#0A192F]">
            <Crown size={16} className="text-[#D4AF37]" />
            Premium AI Preview
          </div>
          <p className="text-base leading-8 text-slate-700">{data.description}</p>
          <label className="block space-y-3">
            <span className="text-sm font-semibold text-slate-600">AIへ相談する内容</span>
            <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 shadow-inner">
              <MessageSquareText size={20} className="text-slate-500" />
              <input
                className="w-full bg-transparent text-sm text-[#0A192F] outline-none placeholder:text-slate-400"
                defaultValue={data.placeholder}
                readOnly
                type="text"
              />
            </div>
          </label>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-[#10233e] via-[#173353] to-[#25466d] p-6 text-white">
          <div className="pointer-events-none absolute inset-0 backdrop-blur-md" />
          <div className="relative">
            <p className="mb-3 text-xs uppercase tracking-[0.24em] text-white/60">
              AI Response Preview
            </p>
            <p className="text-sm leading-8 text-white/82">{data.preview}</p>
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a192f]/22">
            <div className="rounded-full border border-white/20 bg-white/12 p-5 text-[#D4AF37]">
              <Lock size={28} />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function Dashboard({ data = dashboardData, embedded = false }) {
  return (
    <div
      className={cx(
        "overflow-hidden rounded-[32px] border border-slate-200/80 bg-white/80 shadow-[0_24px_55px_rgba(10,25,47,0.08)] backdrop-blur-xl",
        embedded ? "" : "min-h-screen"
      )}
    >
      <Header data={data.header} embedded={embedded} />
      <main className="flex flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
        <TypographicHero data={data.hero} />
        <LunarCountdownWidget data={data.countdown} />
        <Timeline data={data.timeline} />
        <TopicGrid data={data.topics} />
        <PremiumPreview data={data.premium} />
      </main>
    </div>
  );
}
