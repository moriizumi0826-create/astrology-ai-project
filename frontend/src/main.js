import { FORM_STORAGE_KEY, storeReadingResult } from "./reading-storage.js";

function resolveApiBaseUrl() {
  const configured = String(__APP_API_BASE_URL__ || "").trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }

  return "";
}

const API_BASE_URL = resolveApiBaseUrl();
const IS_TEST_VERSION = /(?:^|\/)index-v2\.html$/.test(window.location.pathname);
const FORECAST_DETAIL_PATH = IS_TEST_VERSION
  ? "./forecast-detail-v2.html"
  : "./forecast-detail.html";

const form = document.querySelector("#reading-form");
const birthDateInput = form.querySelector('input[name="birth_date"]');
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
const latitudeInput = form.querySelector('input[name="latitude"]');
const longitudeInput = form.querySelector('input[name="longitude"]');
const timezoneOffsetInput = form.querySelector('input[name="timezone_offset"]');
const numericInputs = [latitudeInput, longitudeInput, timezoneOffsetInput];

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

function getBrowserTimezoneName() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

function getBrowserTimezoneOffsetHours() {
  return String(new Date().getTimezoneOffset() / -60);
}

function ensureTimezoneFallback() {
  if (form.dataset.timezoneName || timezoneOffsetInput.value) {
    return;
  }

  const browserTimezoneName = getBrowserTimezoneName();
  if (browserTimezoneName) {
    setResolvedTimezoneName(browserTimezoneName);
  }

  if (!timezoneOffsetInput.value) {
    timezoneOffsetInput.value =
      deriveOffsetFromTimezone(browserTimezoneName, "") || getBrowserTimezoneOffsetHours();
  }
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

function normalizeBirthDateInput(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (!match) {
    return "";
  }

  const [, year, month, day] = match;
  const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const [resolvedYear, resolvedMonth, resolvedDay] = normalized.split("-").map(Number);
  if (
    date.getFullYear() !== resolvedYear ||
    date.getMonth() + 1 !== resolvedMonth ||
    date.getDate() !== resolvedDay
  ) {
    return "";
  }

  return normalized;
}

function formatBirthDateForDisplay(value) {
  const normalized = normalizeBirthDateInput(value);
  return normalized ? normalized.replaceAll("-", "/") : String(value || "").trim();
}

function normalizeBirthTimeInput(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return "";
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return "";
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function restoreFormSnapshot() {
  const saved = getPersistedFormData();
  if (!saved) {
    return;
  }

  form.querySelector('input[name="full_name"]').value = saved.full_name || "";
  birthDateInput.value = normalizeBirthDateInput(saved.birth_date || "");
  birthTimeInput.value = normalizeBirthTimeInput(saved.birth_time || "") || "";
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
  const browserTimezoneName = getBrowserTimezoneName();
  setResolvedTimezoneName(browserTimezoneName);
  timezoneOffsetInput.value =
    deriveOffsetFromTimezone(browserTimezoneName, "") || getBrowserTimezoneOffsetHours();
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

async function postJson(path, payload) {
  const retryDelays = [1500, 3000, 6000, 10000, 15000, 20000];
  let lastError;

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
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
      if (response.ok) {
        return data;
      }

      const requestError = new Error(data.detail || `Request failed: ${path}`);
      if (![502, 503, 504].includes(response.status) || attempt === retryDelays.length) {
        throw requestError;
      }
      lastError = requestError;
    } catch (error) {
      if (!(error instanceof TypeError) || attempt === retryDelays.length) {
        throw error;
      }
      lastError = error;
    }

    await new Promise((resolve) => window.setTimeout(resolve, retryDelays[attempt]));
  }

  throw lastError || new TypeError("Backend API request failed");
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
ensureTimezoneFallback();
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
  const normalizedBirthDate = normalizeBirthDateInput(payload.birth_date);
  if (!normalizedBirthDate) {
    setError("生年月日は YYYY/MM/DD 形式で入力してください。");
    return;
  }
  payload.birth_date = normalizedBirthDate;
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
  } else if (!payload.birth_time_unknown) {
    const normalizedBirthTime = normalizeBirthTimeInput(payload.birth_time);
    if (!normalizedBirthTime) {
      setError("出生時刻は 24時間表記の HH:MM 形式で入力してください。");
      return;
    }
    payload.birth_time = normalizedBirthTime;
  }
  payload.latitude = Number(payload.latitude);
  payload.longitude = Number(payload.longitude);
  payload.timezone_offset =
    payload.timezone_offset === "" ? null : Number(payload.timezone_offset);
  payload.timezone_name = form.dataset.timezoneName || getBrowserTimezoneName() || null;

  if (payload.timezone_offset === null && payload.timezone_name) {
    payload.timezone_offset =
      Number(deriveOffsetFromTimezone(payload.timezone_name, "")) || null;
  }

  if (
    Number.isNaN(payload.latitude) ||
    Number.isNaN(payload.longitude) ||
    (payload.timezone_offset !== null && Number.isNaN(payload.timezone_offset))
  ) {
    setError("出生地検索を使うか、緯度・経度を正しく入力してください。");
    return;
  }

  if (payload.timezone_offset === null && !payload.timezone_name) {
    setError("タイムゾーンの取得に失敗しました。ページを再読み込みして再度お試しください。");
    return;
  }

  submitLabel.textContent = "Calculating...";
  submitButton.disabled = true;
  submitButton.classList.add("opacity-70", "cursor-not-allowed");

  try {
    const data = await postJson("/api/readings?defer_widgets=true", payload);
    await storeReadingResult(data);
    persistFormData(collectFormSnapshot());
    window.location.href = FORECAST_DETAIL_PATH;
  } catch (error) {
    if (error instanceof TypeError) {
      const endpoint = API_BASE_URL || "現在のサイト";
      setError(`Backend API（${endpoint}）との通信に失敗しました。時間をおいて再度お試しください。`);
    } else {
      setError(error.message || "Unknown error");
    }
  } finally {
    submitLabel.textContent = "ホロスコープを算出する";
    submitButton.disabled = false;
    submitButton.classList.remove("opacity-70", "cursor-not-allowed");
  }
});
