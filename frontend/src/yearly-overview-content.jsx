import React from "react";


const SECTION_LABELS = {
  global_theme: "今年の総合テーマ",
  core_evolution: "中心領域の変化",
  house_transition: "主要天体の移動",
  annual_flow: "今年の流れ",
  action: "今年のアクション",
};

export function YearlyOverviewContent({ overview }) {
  const sections = Array.isArray(overview?.sections)
    ? overview.sections.filter((section) => section?.text)
    : Object.entries(overview?.paragraphs || {})
      .filter(([, text]) => text)
      .map(([key, text]) => ({ key, label: SECTION_LABELS[key] || key, text }));

  return (
    <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-color:#e9c349_rgba(255,255,255,0.08)] [scrollbar-width:thin] sm:mt-6 sm:pr-3">
      <article className="pb-6 sm:pb-8">
        <p className="font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-gold/80 sm:text-xs">
          {overview?.year ? `${overview.year} Yearly Overview` : "Yearly Overview"}
        </p>
        <h3 className="mt-2 break-words font-serif text-lg font-semibold leading-snug text-starlight sm:mt-3 sm:text-2xl">
          {overview?.title || "今年の総評"}
        </h3>
        {overview?.summary ? (
          <p className="mt-3 text-xs font-semibold leading-6 text-[#efe7cf] sm:text-sm sm:leading-7">
            {overview.summary}
          </p>
        ) : null}
      </article>

      {sections.map((section) => {
        const isAction = section.key === "action";
        return (
          <section
            key={section.key}
            className={isAction
              ? "border-l-2 border-gold/70 py-1 pl-3 sm:pl-4"
              : "border-t border-white/10 py-5 sm:py-6"}
          >
            <h4 className="font-serif text-base font-semibold text-starlight sm:text-xl">
              {section.label || SECTION_LABELS[section.key] || "今年の流れ"}
            </h4>
            <p className="mt-2 whitespace-pre-line text-xs leading-6 text-mist sm:mt-3 sm:text-sm sm:leading-7">
              {section.text}
            </p>
          </section>
        );
      })}
    </div>
  );
}
