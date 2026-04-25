const API_BASE_URL = __APP_API_BASE_URL__;

const form = document.querySelector("#reading-form");
const birthTimeInput = document.querySelector("#birth-time-input");
const birthTimeUnknownCheckbox = document.querySelector("#birth-time-unknown");
const birthPrefectureSelect = document.querySelector("#birth-prefecture");
const birthplaceInput = document.querySelector("#birthplace-input");
const searchLocationButton = document.querySelector("#search-location-button");
const locationSearchStatus = document.querySelector("#location-search-status");
const locationSearchResults = document.querySelector("#location-search-results");
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
const latitudeInput = form.querySelector('input[name="latitude"]');
const longitudeInput = form.querySelector('input[name="longitude"]');
const timezoneOffsetInput = form.querySelector('input[name="timezone_offset"]');
const numericInputs = [latitudeInput, longitudeInput, timezoneOffsetInput];
const FORM_STORAGE_KEY = "celestial-atelier:last-reading-form";
const RESULT_STORAGE_KEY = "celestial-atelier:last-reading-result";

function roundCoordinate(value) {
  return Number(value).toFixed(4);
}

function deriveOffsetFromTimezone(timezoneName, fallbackOffset) {
  if (fallbackOffset != null && fallbackOffset !== "") {
    return String(fallbackOffset);
  }
  if (timezoneName === "Asia/Tokyo") {
    return "9";
  }
  return "";
}

function setResolvedTimezoneName(value) {
  if (value) {
    form.dataset.timezoneName = value;
  } else {
    delete form.dataset.timezoneName;
  }
}

function getPersistedFormData() {
  try {
    const raw = window.localStorage.getItem(FORM_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function persistFormData(data) {
  try {
    window.localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage errors so the form still works normally.
  }
}

function collectFormSnapshot() {
  return {
    full_name: form.querySelector('input[name="full_name"]').value || "",
    birth_date: form.querySelector('input[name="birth_date"]').value || "",
    birth_time: birthTimeInput.value || "",
    birth_time_unknown: birthTimeUnknownCheckbox.checked,
    birth_prefecture: birthPrefectureSelect.value || "",
    birthplace: birthplaceInput.value || "",
    resolved_birthplace: birthplaceInput.dataset.resolvedBirthplace || "",
    latitude: latitudeInput.value || "",
    longitude: longitudeInput.value || "",
    timezone_offset: timezoneOffsetInput.value || "",
    timezone_name: form.dataset.timezoneName || "",
  };
}

function restoreFormSnapshot() {
  const saved = getPersistedFormData();
  if (!saved) {
    return;
  }

  form.querySelector('input[name="full_name"]').value = saved.full_name || "";
  form.querySelector('input[name="birth_date"]').value = saved.birth_date || "";
  birthTimeInput.value = saved.birth_time || "";
  birthTimeUnknownCheckbox.checked = Boolean(saved.birth_time_unknown);
  birthPrefectureSelect.value = saved.birth_prefecture || "";
  birthplaceInput.value = saved.birthplace || "";
  latitudeInput.value = saved.latitude || "";
  longitudeInput.value = saved.longitude || "";
  timezoneOffsetInput.value = saved.timezone_offset || "";

  if (saved.resolved_birthplace) {
    birthplaceInput.dataset.resolvedBirthplace = saved.resolved_birthplace;
  }
  setResolvedTimezoneName(saved.timezone_name || "");

  syncBirthTimeState();
  numericInputs.forEach((input) => syncNumericInputTone(input));
}

function syncNumericInputTone(input) {
  input.classList.toggle("has-value", String(input.value || "").trim() !== "");
}

function buildBirthplaceQuery() {
  const cityOrArea = birthplaceInput.value.trim();
  const prefecture = birthPrefectureSelect.value.trim();

  if (!prefecture) {
    throw new Error("先に都道府県を選択してください。");
  }
  if (!cityOrArea) {
    throw new Error("市区町村や出生地エリアを入力してください。");
  }

  return {
    cityOrArea,
    prefecture,
  };
}

function showLocationSearchStatus(message, isError = false) {
  locationSearchStatus.textContent = message;
  locationSearchStatus.classList.remove("hidden");
  locationSearchStatus.classList.toggle("text-[#9d3c2a]", isError);
}

function clearLocationSearchStatus() {
  locationSearchStatus.textContent = "";
  locationSearchStatus.classList.add("hidden");
  locationSearchStatus.classList.remove("text-[#9d3c2a]");
}

function clearLocationSearchResults() {
  locationSearchResults.innerHTML = "";
  locationSearchResults.classList.add("hidden");
}

function getLocationSearchParams() {
  const params = new URLSearchParams({
    q: buildBirthplaceQuery().cityOrArea,
    prefecture: buildBirthplaceQuery().prefecture,
  });
  return params;
}

function applyLocationResult(result) {
  birthplaceInput.dataset.resolvedBirthplace = result.display_name;
  latitudeInput.value = roundCoordinate(result.latitude);
  longitudeInput.value = roundCoordinate(result.longitude);
  timezoneOffsetInput.value = deriveOffsetFromTimezone(
    result.timezone_name,
    result.timezone_offset
  );
  setResolvedTimezoneName(result.timezone_name);
  syncNumericInputTone(latitudeInput);
  syncNumericInputTone(longitudeInput);
  syncNumericInputTone(timezoneOffsetInput);
  clearLocationSearchResults();
  showLocationSearchStatus(`${result.display_name} を入力しました。`);
  persistFormData(collectFormSnapshot());
}

function clearResolvedBirthplace() {
  delete birthplaceInput.dataset.resolvedBirthplace;
  setResolvedTimezoneName("");
}

function renderLocationSearchResults(results) {
  if (!results.length) {
    clearLocationSearchResults();
    showLocationSearchStatus("候補が見つかりませんでした。別の地名で試すか、手入力してください。", true);
    return;
  }

  locationSearchResults.innerHTML = results
    .map(
      (result, index) => `
        <button
          class="w-full text-left bg-surface-container-lowest border border-outline-variant/30 px-4 py-4 hover:border-secondary hover:bg-[#fbfaf3] transition-colors duration-300"
          type="button"
          data-location-result-index="${index}"
        >
          <div class="font-notoSerif text-lg text-primary">${escapeHtml(result.display_name)}</div>
        </button>
      `
    )
    .join("");
  locationSearchResults.classList.remove("hidden");
  locationSearchResults.classList.add("flex");
  locationSearchResults.querySelectorAll("[data-location-result-index]").forEach((button) => {
    button.addEventListener("click", () => {
      applyLocationResult(results[Number(button.dataset.locationResultIndex)]);
    });
  });
  showLocationSearchStatus("候補から出生地を選択してください。");
}

async function searchLocationCandidates() {
  clearError();
  clearLocationSearchResults();
  clearLocationSearchStatus();

  const params = getLocationSearchParams();
  if (!params) {
    return;
  }

  searchLocationButton.disabled = true;
  searchLocationButton.classList.add("opacity-70", "cursor-not-allowed");
  showLocationSearchStatus("出生地候補を検索しています...");

  try {
    const response = await fetch(`${API_BASE_URL}/api/location-search?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || "出生地検索に失敗しました。");
    }
    renderLocationSearchResults(data.results || []);
  } catch (error) {
    showLocationSearchStatus(error.message || "出生地検索に失敗しました。", true);
  } finally {
    searchLocationButton.disabled = false;
    searchLocationButton.classList.remove("opacity-70", "cursor-not-allowed");
  }
}

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
restoreFormSnapshot();
syncBirthTimeState();
searchLocationButton.addEventListener("click", searchLocationCandidates);
birthplaceInput.addEventListener("input", clearResolvedBirthplace);
birthPrefectureSelect.addEventListener("change", clearResolvedBirthplace);
numericInputs.forEach((input) => {
  syncNumericInputTone(input);
  input.addEventListener("input", () => syncNumericInputTone(input));
  input.addEventListener("change", () => syncNumericInputTone(input));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();

  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  payload.birth_time_unknown = birthTimeUnknownCheckbox.checked;
  try {
    payload.birthplace =
      birthplaceInput.dataset.resolvedBirthplace ||
      `${buildBirthplaceQuery().cityOrArea}, ${buildBirthplaceQuery().prefecture}, Japan`;
  } catch (error) {
    setError(error.message || "出生地を入力してください。");
    return;
  }
  if (payload.birth_time_unknown && !payload.birth_time) {
    payload.birth_time = null;
  }
  payload.latitude = Number(payload.latitude);
  payload.longitude = Number(payload.longitude);
  payload.timezone_offset =
    payload.timezone_offset === "" ? null : Number(payload.timezone_offset);
  payload.timezone_name = form.dataset.timezoneName || null;

  if (
    Number.isNaN(payload.latitude) ||
    Number.isNaN(payload.longitude) ||
    (payload.timezone_offset !== null && Number.isNaN(payload.timezone_offset))
  ) {
    setError("出生地検索を使うか、緯度・経度を正しく入力してください。");
    return;
  }

  if (payload.timezone_offset === null && !payload.timezone_name) {
    setError("出生地検索を使うか、UTC オフセットを入力してください。");
    return;
  }

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

    window.sessionStorage.setItem(RESULT_STORAGE_KEY, JSON.stringify(data));
    persistFormData(collectFormSnapshot());
    window.location.href = "/results.html";
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
