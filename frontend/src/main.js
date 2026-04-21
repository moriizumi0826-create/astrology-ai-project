const API_BASE_URL = __APP_API_BASE_URL__;

const form = document.querySelector("#reading-form");
const birthTimeInput = document.querySelector("#birth-time-input");
const birthTimeUnknownCheckbox = document.querySelector("#birth-time-unknown");
const submitLabel = document.querySelector("#submit-label");
const submitButton = form.querySelector('button[type="submit"]');
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
  errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
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

function renderAccordionReading(item) {
  const sections = splitReportSections(item.content);
  if (!sections.length) {
    return `
      <article class="bg-surface-container-lowest p-10 flex flex-col gap-6 reveal">
        <div>
          <p class="text-[10px] uppercase tracking-[0.3em] text-secondary font-bold mb-4">${escapeHtml(item.type)}</p>
          <h3 class="font-notoSerif text-2xl text-primary mb-4">${escapeHtml(item.title)}</h3>
          <p class="text-on-surface-variant leading-relaxed whitespace-pre-wrap">${escapeHtml(item.content)}</p>
        </div>
      </article>
    `;
  }

  return sections
    .map(
      (section) => `
        <article class="bg-surface-container-lowest p-0 flex flex-col reveal shadow-[0px_12px_24px_rgba(46,52,45,0.05)]">
          <details class="group">
            <summary class="list-none cursor-pointer px-6 py-5 flex items-center justify-between gap-4">
              <div class="flex flex-col gap-2">
                <p class="text-[10px] uppercase tracking-[0.3em] text-secondary font-bold">${escapeHtml(item.type)}</p>
                <span class="font-notoSerif text-xl text-primary leading-snug">${escapeHtml(section.title)}</span>
              </div>
              <span class="material-symbols-outlined text-secondary transition-transform duration-300 group-open:rotate-180">expand_more</span>
            </summary>
            <div class="px-6 pb-6 pt-2 border-t border-outline-variant/20">
              <p class="text-on-surface-variant leading-relaxed whitespace-pre-wrap font-notoSansJP">${escapeHtml(section.body)}</p>
            </div>
          </details>
        </article>
      `
    )
    .join("");
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

  const hasStructuredReport = payload.readings.some(
    (item) => splitReportSections(item.content).length > 0
  );
  readingGrid.className = hasStructuredReport
    ? "grid grid-cols-1 lg:grid-cols-2 gap-6"
    : "grid grid-cols-1 lg:grid-cols-3 gap-8";

  readingGrid.innerHTML = payload.readings
    .map((item) => renderAccordionReading(item))
    .join("");
}

function syncBirthTimeState() {
  const isUnknown = birthTimeUnknownCheckbox.checked;
  birthTimeInput.disabled = isUnknown;
  birthTimeInput.required = !isUnknown;

  if (isUnknown) {
    birthTimeInput.value = "";
  }
}

birthTimeUnknownCheckbox.addEventListener("change", syncBirthTimeState);
syncBirthTimeState();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.birth_time_unknown = birthTimeUnknownCheckbox.checked;
  if (payload.birth_time_unknown && !payload.birth_time) {
    payload.birth_time = null;
  }
  payload.latitude = Number(payload.latitude);
  payload.longitude = Number(payload.longitude);
  payload.timezone_offset = Number(payload.timezone_offset);

  submitLabel.textContent = "Calculating...";
  submitButton.disabled = true;
  submitButton.classList.add("opacity-70", "cursor-not-allowed");

  try {
    const response = await fetch(`${API_BASE_URL}/api/readings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : { detail: await response.text() };
    if (!response.ok) {
      throw new Error(data.detail || "Failed to generate reading.");
    }

    renderReadings(data);
    document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    if (error instanceof TypeError) {
      setError("Backend API に接続できませんでした。backend が http://127.0.0.1:8000 で起動しているか確認してください。");
    } else {
      setError(error.message || "Unknown error");
    }
  } finally {
    submitLabel.textContent = "ホロスコープを算出する";
    submitButton.disabled = false;
    submitButton.classList.remove("opacity-70", "cursor-not-allowed");
  }
});
