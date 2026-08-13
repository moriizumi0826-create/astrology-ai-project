import React from "react";
import { sortMonthlyOverviewAdditions } from "./monthly-overview.mjs";


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
};

function formatOverviewDate(value) {
  const match = String(value || "").match(/^\d{4}-(\d{2})-(\d{2})/);
  if (!match) return value || "-";
  return `${Number(match[1])}/${Number(match[2])}`;
}

export function MonthlyOverviewContent({ overview }) {
  const editorial = overview?.editorial || {};
  const eventParagraphs = Array.isArray(overview?.event_paragraphs) ? overview.event_paragraphs : [];
  const aspectClusters = Array.isArray(overview?.aspect_clusters) ? overview.aspect_clusters : [];
  const backgrounds = Array.isArray(overview?.long_term_backgrounds) ? overview.long_term_backgrounds : [];
  const resonance = overview?.resonance || null;
  const additions = sortMonthlyOverviewAdditions(eventParagraphs, aspectClusters).map(({ kind, row }) => (
    kind === "event"
      ? {
          key: row.Template_ID,
          label: "流れの切り替わり",
          title: `${PLANET_LABELS[row.Planet] || row.Planet || "星"}の動き`,
          body: row.Paragraph_Template,
        }
      : {
          key: row.Template_ID,
          label: "複合配置",
          title: row.Title,
          body: row.Paragraph_Template,
        }
  ));

  return (
    <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin] sm:mt-6 sm:pr-3">
      <article className="pb-6 sm:pb-8">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-gold sm:text-xs">
          {formatOverviewDate(overview?.as_of || overview?.asOf)} · Monthly overview
        </p>
        <h3 className="mt-2 break-words font-serif text-lg font-semibold leading-snug text-starlight sm:mt-3 sm:text-2xl">
          {editorial.Title || "今月の総評"}
        </h3>
        <p className="mt-3 text-xs font-semibold leading-6 text-[#efe7cf] sm:text-sm sm:leading-7">
          {editorial.Summary}
        </p>
        <p className="mt-4 whitespace-pre-line text-xs leading-6 text-mist sm:mt-5 sm:text-sm sm:leading-7">
          {editorial.Interpretation}
        </p>
        {editorial.Action ? (
          <div className="mt-5 border-l-2 border-gold/70 pl-3 sm:mt-6 sm:pl-4">
            <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-gold sm:text-xs">今月の指針</p>
            <p className="mt-2 text-xs leading-6 text-mist sm:text-sm sm:leading-7">{editorial.Action}</p>
          </div>
        ) : null}
      </article>

      {additions.length ? (
        <section className="border-t border-white/10 py-6 sm:py-8">
          <h3 className="font-serif text-base font-semibold text-starlight sm:text-xl">今月の動き</h3>
          <div className="mt-4 grid gap-5 sm:mt-5 sm:gap-6">
            {additions.map((item) => (
              <article key={item.key} className="border-t border-white/10 pt-4 first:border-t-0 first:pt-0">
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-gold/80 sm:text-xs">{item.label}</p>
                {item.title ? <h4 className="mt-1 text-sm font-semibold leading-6 text-starlight sm:text-base">{item.title}</h4> : null}
                <p className="mt-2 whitespace-pre-line text-xs leading-6 text-mist sm:text-sm sm:leading-7">{item.body}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {backgrounds.length || resonance ? (
        <section className="border-t border-white/10 py-6 sm:py-8">
          <h3 className="font-serif text-base font-semibold text-starlight sm:text-xl">あなたの長期背景</h3>
          <div className="mt-4 grid gap-5 sm:mt-5 sm:gap-6">
            {backgrounds.map((item) => (
              <article key={item.Record_ID} className="border-t border-white/10 pt-4 first:border-t-0 first:pt-0">
                <h4 className="text-sm font-semibold leading-6 text-starlight sm:text-base">{item.Title}</h4>
                <p className="mt-2 whitespace-pre-line text-xs leading-6 text-mist sm:text-sm sm:leading-7">{item.Interpretation}</p>
              </article>
            ))}
            {resonance ? (
              <article className="border-t border-white/10 pt-4">
                <p className="font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#b9a9ff] sm:text-xs">今、強まっている重なり</p>
                <h4 className="mt-1 text-sm font-semibold leading-6 text-starlight sm:text-base">{resonance.Title}</h4>
                <p className="mt-2 whitespace-pre-line text-xs leading-6 text-mist sm:text-sm sm:leading-7">{resonance.Interpretation}</p>
              </article>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
