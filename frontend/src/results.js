const RESULT_STORAGE_KEY = "celestial-atelier:last-reading-result";

const errorBox = document.querySelector("#error-box");
const readingGrid = document.querySelector("#reading-grid");
const metaCard = document.querySelector("#meta-card");
const chartCard = document.querySelector("#chart-card");
const metaName = document.querySelector("#meta-name");
const metaBirth = document.querySelector("#meta-birth");
const metaPlace = document.querySelector("#meta-place");
const chartDataNode = document.querySelector("#chart-data");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function splitReportSections(content) {
  const lines = String(content || "").split("\n");
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^【第\d+章：.+】$/.test(trimmed)) {
      if (currentSection) {
        currentSection.body = currentSection.body.trim();
        sections.push(currentSection);
      }
      currentSection = { title: trimmed, body: "" };
      continue;
    }

    if (!currentSection) {
      continue;
    }

    currentSection.body += `${currentSection.body ? "\n" : ""}${line}`;
  }

  if (currentSection) {
    currentSection.body = currentSection.body.trim();
    sections.push(currentSection);
  }

  return sections;
}

function extractTopicContent(sections, keywords) {
  const blocks = sections
    .map((section) => {
      const matchedLines = section.body
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && keywords.some((keyword) => line.includes(keyword)));

      if (!matchedLines.length) {
        return "";
      }

      return `${section.title}\n${matchedLines.join("\n")}`;
    })
    .filter(Boolean);

  return blocks.join("\n\n").trim();
}

function renderInnerSection(section) {
  return `
    <article class="bg-surface-container-lowest p-0 flex flex-col border border-outline-variant/35 rounded-2xl overflow-hidden shadow-[0px_12px_24px_rgba(46,52,45,0.05)]">
      <details class="group">
        <summary class="list-none cursor-pointer px-6 py-5 flex items-center justify-between gap-4 bg-[#fcfbf6]">
          <span class="font-notoSerif text-xl text-primary leading-snug">${escapeHtml(section.title)}</span>
          <span class="material-symbols-outlined text-secondary transition-transform duration-300 group-open:rotate-180">expand_more</span>
        </summary>
        <div class="px-6 pb-6 pt-4 border-t border-outline-variant/20 bg-white">
          <p class="text-on-surface-variant leading-relaxed whitespace-pre-wrap font-notoSansJP">${escapeHtml(section.body)}</p>
        </div>
      </details>
    </article>
  `;
}

function renderNestedReportPanel(title, sections) {
  return `
    <article class="bg-surface-container-lowest p-0 flex flex-col reveal border border-outline-variant/40 rounded-[28px] overflow-hidden shadow-[0px_18px_36px_rgba(46,52,45,0.08)]">
      <details class="group" open>
        <summary class="list-none cursor-pointer px-7 py-6 flex items-center justify-between gap-4 bg-surface-container-low">
          <div class="flex flex-col gap-2">
            <p class="text-[10px] uppercase tracking-[0.3em] text-secondary font-bold">Reading</p>
            <span class="font-notoSerif text-2xl text-primary leading-snug">${escapeHtml(title)}</span>
          </div>
          <span class="material-symbols-outlined text-secondary transition-transform duration-300 group-open:rotate-180">expand_more</span>
        </summary>
        <div class="p-6 md:p-7 border-t border-outline-variant/20 bg-[#fffdf8]">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            ${sections.map((section) => renderInnerSection(section)).join("")}
          </div>
        </div>
      </details>
    </article>
  `;
}

function renderTopicPanel(title, content) {
  const body = content || `${title}に関する抽出結果はまだありません。`;
  return `
    <article class="bg-surface-container-lowest p-0 flex flex-col reveal border border-outline-variant/40 rounded-[28px] overflow-hidden shadow-[0px_18px_36px_rgba(46,52,45,0.08)]">
      <details class="group">
        <summary class="list-none cursor-pointer px-7 py-6 flex items-center justify-between gap-4 bg-surface-container-low">
          <div class="flex flex-col gap-2">
            <p class="text-[10px] uppercase tracking-[0.3em] text-secondary font-bold">Topic</p>
            <span class="font-notoSerif text-2xl text-primary leading-snug">${escapeHtml(title)}</span>
          </div>
          <span class="material-symbols-outlined text-secondary transition-transform duration-300 group-open:rotate-180">expand_more</span>
        </summary>
        <div class="px-7 pb-7 pt-5 border-t border-outline-variant/20 bg-white">
          <p class="text-on-surface-variant leading-relaxed whitespace-pre-wrap font-notoSansJP">${escapeHtml(body)}</p>
        </div>
      </details>
    </article>
  `;
}

function buildTopLevelPanels(payload) {
  const fullReport = payload.readings.find((item) => item.type === "full_report") || payload.readings[0];
  const sections = fullReport ? splitReportSections(fullReport.content) : [];

  const loveContent = extractTopicContent(sections, [
    "恋愛",
    "愛情",
    "対人",
    "パートナー",
    "関係",
    "結婚",
    "好意",
  ]);
  const workContent = extractTopicContent(sections, [
    "仕事",
    "キャリア",
    "職場",
    "社会",
    "業務",
    "成果",
    "働",
  ]);

  return [
    renderNestedReportPanel("Full_report", sections),
    renderTopicPanel("恋愛", loveContent),
    renderTopicPanel("仕事", workContent),
  ];
}

function renderReadings(payload) {
  metaCard.classList.remove("hidden");
  chartCard.classList.remove("hidden");

  metaName.textContent = payload.meta.full_name;
  metaBirth.textContent = `${payload.meta.birth_date} ${payload.meta.birth_time} / UTC${payload.meta.timezone_offset >= 0 ? "+" : ""}${payload.meta.timezone_offset}`;
  metaPlace.textContent = payload.meta.birthplace;
  chartDataNode.textContent = Object.entries(payload.chart_data)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");

  readingGrid.className = "grid grid-cols-1 gap-8";
  readingGrid.innerHTML = buildTopLevelPanels(payload).join("");
}

function restoreLatestResult() {
  try {
    const raw = window.sessionStorage.getItem(RESULT_STORAGE_KEY);
    if (!raw) {
      setError("表示できる鑑定結果がありません。入力ページからホロスコープを算出してください。");
      return;
    }
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== "object") {
      throw new Error("invalid payload");
    }
    renderReadings(payload);
  } catch {
    setError("鑑定結果の読み込みに失敗しました。入力ページからもう一度お試しください。");
  }
}

restoreLatestResult();
