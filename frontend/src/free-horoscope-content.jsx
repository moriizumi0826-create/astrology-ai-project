import React from "react";
import { ChevronRight } from "lucide-react";

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function HoroscopeCard({ children, className = "", bodyClassName = "" }) {
  return (
    <section className={cx(
      "overflow-hidden rounded-2xl border border-[#e9c349]/22 bg-[#1a1c1c]/54 shadow-[0_0_34px_rgba(0,0,0,0.28)] backdrop-blur-xl transition hover:border-[#e9c349]/45 hover:shadow-[0_0_18px_rgba(233,195,73,0.12)]",
      className
    )}>
      <div className={cx("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

function splitStoredReportSections(content) {
  const lines = String(content || "").split("\n");
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^【第\d+章[：:].+】$/.test(trimmed)) {
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

export function FreeHoroscopeContent({ data, belowMetaContent = null }) {
  const payload = data && typeof data === "object" ? data : {};
  const readings = Array.isArray(payload.readings) ? payload.readings : [];
  const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};
  const chartData = payload.chart_data && typeof payload.chart_data === "object"
    ? payload.chart_data
    : null;

  if (payload.is_loading) {
    return (
      <main className="mx-auto max-w-[1440px] px-5 py-5 md:px-8 lg:px-14">
        <HoroscopeCard bodyClassName="flex min-h-[220px] items-center justify-center p-8">
          <p className="font-mono text-sm font-bold tracking-[0.18em] text-[#c7c6cc]">読込中</p>
        </HoroscopeCard>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1440px] px-5 py-5 md:px-8 lg:px-14">
      <section className="mb-5 border-b border-white/10 pb-5">
        <p className="font-mono text-[10px] font-black uppercase tracking-[0.3em] text-[#e9c349]">Horoscope</p>
        <h1 className="mt-2 font-notoSerif text-3xl font-semibold leading-tight text-[#f3f3f0] md:text-5xl">
          Curated Results
        </h1>
      </section>

      {Object.keys(meta).length ? (
        <HoroscopeCard className="mb-5" bodyClassName="p-5">
          <div className="grid gap-4 font-mono text-xs font-bold text-[#c7c6cc] md:grid-cols-3">
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.22em] text-[#e9c349]">Name</p>
              <p>{meta.full_name || meta.name || "-"}</p>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.22em] text-[#e9c349]">Birth</p>
              <p>
                {[meta.birth_date, meta.birth_time].filter(Boolean).join(" ") || "-"}
                {meta.timezone_offset !== undefined
                  ? ` / UTC${Number(meta.timezone_offset) >= 0 ? "+" : ""}${meta.timezone_offset}`
                  : ""}
              </p>
            </div>
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.22em] text-[#e9c349]">Place</p>
              <p>{meta.birthplace || meta.location || "-"}</p>
            </div>
          </div>
        </HoroscopeCard>
      ) : null}

      {belowMetaContent}

      {readings.length ? (
        <div className="grid gap-5">
          {readings.map((item, itemIndex) => {
            const sections = splitStoredReportSections(item.content);
            const title = item.type === "full_report" ? "簡易リポート" : item.title || item.type || "リポート";
            return (
              <HoroscopeCard key={`${item.type || "reading"}-${itemIndex}`} bodyClassName="p-0">
                <details className="group" open={itemIndex === 0}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border-b border-white/10 px-5 py-5">
                    <div>
                      <p className="font-mono text-[10px] font-black uppercase tracking-[0.3em] text-[#e9c349]">Reading</p>
                      <h2 className="mt-2 font-notoSerif text-2xl font-semibold text-[#f3f3f0]">{title}</h2>
                    </div>
                    <ChevronRight size={20} className="shrink-0 text-[#e9c349] transition group-open:rotate-90" />
                  </summary>
                  <div className="grid gap-4 p-5 lg:grid-cols-2">
                    {sections.length ? sections.map((section, sectionIndex) => (
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
                    )) : (
                      <article className="rounded-2xl border border-white/10 bg-[#0d0e0f]/45 p-5 lg:col-span-2">
                        <p className="whitespace-pre-wrap text-sm font-medium leading-7 text-[#c7c6cc]">
                          {item.content || "表示できるリポートがありません。"}
                        </p>
                      </article>
                    )}
                  </div>
                </details>
              </HoroscopeCard>
            );
          })}
        </div>
      ) : (
        <HoroscopeCard bodyClassName="p-8">
          <p className="font-mono text-sm font-bold uppercase tracking-[0.18em] text-[#909096]">
            保存済みの鑑定結果がありません
          </p>
        </HoroscopeCard>
      )}

      {chartData ? (
        <HoroscopeCard className="mt-5" bodyClassName="p-5">
          <p className="mb-4 font-mono text-[10px] font-black uppercase tracking-[0.3em] text-[#e9c349]">Natal Data</p>
          <pre className="whitespace-pre-wrap font-mono text-xs leading-6 text-[#c7c6cc]">
            {Object.entries(chartData).map(([key, value]) => `${key}: ${value}`).join("\n")}
          </pre>
        </HoroscopeCard>
      ) : null}
    </main>
  );
}
