import { FORM_STORAGE_KEY, storeReadingForm, storeReadingResult } from "./reading-storage.js";

import { buildBirthRequest, birthLocationQuery, birthSearchScope, birthTimezoneNames, normalizeBirthDate as normalizeBirthDateInput, normalizeBirthTime as normalizeBirthTimeInput } from "./birth-input.mjs";

import { withDeviceTimezone } from "./device-time.mjs";

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
const FORECAST_DETAIL_PATH = "./forecast-detail-v2.html";

const form = document.querySelector("#reading-form");
const birthDateInput = form.querySelector('input[name="birth_date"]');
const birthTimeInput = document.querySelector("#birth-time-input");
const birthTimeUnknownCheckbox = document.querySelector("#birth-time-unknown");
const birthPrefectureSelect = document.querySelector("#birth-prefecture");
const birthCountrySelect = document.querySelector("#birth-country");
const timezoneNameInput = document.querySelector("#birth-timezone");
const birthTimeFoldSelect = document.querySelector("#birth-time-fold");
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




function ensureTimezoneFallback() {
  if (!timezoneNameInput.value && !timezoneOffsetInput.value && birthCountrySelect.value === "JP") {
    setResolvedTimezoneName("Asia/Tokyo");
  }
}

function setResolvedTimezoneName(value) {
  timezoneNameInput.value = value || "";
  // A numerical offset is only for legacy/manual fixed-offset input.
  timezoneOffsetInput.value = "";
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
  storeReadingForm(data);
}

function collectFormSnapshot() {
  return {
    full_name: form.querySelector('input[name="full_name"]').value || "",
    birth_date: form.querySelector('input[name="birth_date"]').value || "",
    birth_time: birthTimeInput.value || "",
    birth_time_unknown: birthTimeUnknownCheckbox.checked,
    birth_prefecture: birthPrefectureSelect.value || "",
    birth_country: birthCountrySelect.value,
    birth_time_fold: birthTimeFoldSelect.value === "" ? null : Number(birthTimeFoldSelect.value),
    birthplace: birthplaceInput.value || "",
    resolved_birthplace: birthplaceInput.dataset.resolvedBirthplace || "",
    latitude: latitudeInput.value || "",
    longitude: longitudeInput.value || "",
    timezone_offset: timezoneOffsetInput.value || "",
    timezone_name: timezoneNameInput.value.trim(),
  };
}


function formatBirthDateForDisplay(value) {
  const normalized = normalizeBirthDateInput(value);
  return normalized ? normalized.replaceAll("-", "/") : String(value || "").trim();
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
  birthCountrySelect.value = birthSearchScope(saved);
  birthTimeFoldSelect.value = String(saved.birth_time_fold ?? "");
  birthplaceInput.value = saved.birthplace || "";
  latitudeInput.value = saved.latitude ?? "";
  longitudeInput.value = saved.longitude ?? "";

  if (saved.resolved_birthplace) {
    birthplaceInput.dataset.resolvedBirthplace = saved.resolved_birthplace;
  }
  setResolvedTimezoneName(saved.timezone_name || "");
  if (!saved.timezone_name) timezoneOffsetInput.value = saved.timezone_offset ?? "";

  syncBirthTimeState();
  numericInputs.forEach((input) => syncNumericInputTone(input));
}

function syncNumericInputTone(input) {
  input.classList.toggle("has-value", String(input.value || "").trim() !== "");
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
  const snapshot = collectFormSnapshot();
  const params = new URLSearchParams(birthLocationQuery(snapshot));
  const birthDate = normalizeBirthDateInput(snapshot.birth_date);
  if (birthDate) params.set("birth_date", birthDate);
  if (snapshot.birth_time) params.set("birth_time", snapshot.birth_time);
  params.set("birth_time_unknown", String(snapshot.birth_time_unknown));
  return params;
}

function applyLocationResult(result) {
  birthplaceInput.dataset.resolvedBirthplace = result.display_name;
  latitudeInput.value = roundCoordinate(result.latitude);
  longitudeInput.value = roundCoordinate(result.longitude);
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
  latitudeInput.value = "";
  longitudeInput.value = "";
  setResolvedTimezoneName(birthCountrySelect.value === "JP" ? "Asia/Tokyo" : "");
  birthTimeFoldSelect.value = "";
  numericInputs.forEach(syncNumericInputTone);
  clearLocationSearchResults();
  clearLocationSearchStatus();
}

function syncBirthCountry() {
  const japan = birthCountrySelect.value === "JP";
  birthPrefectureSelect.required = japan;
  birthPrefectureSelect.disabled = !japan;
  birthPrefectureSelect.parentElement.hidden = !japan;
  birthplaceInput.placeholder = japan ? "世田谷区 / 札幌市 / Yokohama" : "Paris, France / New York City";
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


  searchLocationButton.disabled = true;
  searchLocationButton.classList.add("opacity-70", "cursor-not-allowed");
  showLocationSearchStatus("出生地候補を検索しています...");

  try {
    const params = getLocationSearchParams();
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
  payload = withDeviceTimezone(payload);
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
birthTimeUnknownCheckbox.addEventListener("change", () => { birthTimeFoldSelect.value = ""; });
restoreFormSnapshot();
syncBirthCountry();
ensureTimezoneFallback();
document.querySelector("#birth-timezones").replaceChildren(...birthTimezoneNames().map((zone) => {
  const option = document.createElement("option");
  option.value = zone;
  return option;
}));
birthCountrySelect.addEventListener("change", () => {
  syncBirthCountry();
  clearResolvedBirthplace();
});
timezoneNameInput.addEventListener("input", () => {
  timezoneOffsetInput.value = "";
  birthTimeFoldSelect.value = "";
});
birthDateInput.addEventListener("change", () => { birthTimeFoldSelect.value = ""; });
birthTimeInput.addEventListener("change", () => { birthTimeFoldSelect.value = ""; });
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

  let payload;
  try {
    payload = buildBirthRequest(collectFormSnapshot());
  } catch (error) {
    setError(error.message || "出生情報を確認してください。");
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
