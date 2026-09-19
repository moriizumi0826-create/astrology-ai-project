import { localDate, deviceTimezone, isSameDisplayTimezone, storedDisplayTimezone } from "../src/device-time.mjs";
export const RESULT_STORAGE_KEY = "celestial-atelier:v3:last-reading-result";
export let FORM_STORAGE_KEY = "celestial-atelier:v3:last-reading-form:anonymous";
let resultKey = `${RESULT_STORAGE_KEY}:anonymous`;
let accessKey = "";
let memoryResult = null;
let memoryForm = null;
let accountOwner = null;
let privateMember = false;

export function storageOwner() { return accountOwner; }

export function configureStorage(session) {
  const owner = encodeURIComponent(session?.user_id || "anonymous");
  const next = `${owner}:${session?.state || "anonymous"}`;
  if (accountOwner !== owner) memoryForm = null;
  accountOwner = owner;
  privateMember = String(session?.user_id || "").startsWith("supabase:");
  if (accessKey !== next) memoryResult = null;
  accessKey = next;
  FORM_STORAGE_KEY = `celestial-atelier:v3:last-reading-form:${owner}`;
  resultKey = `${RESULT_STORAGE_KEY}:${owner}`;
}
export function freeResult(payload) {
  const dashboard = payload?.dashboard_data || {};
  return {
    meta: payload?.meta || {}, chart_data: payload?.chart_data || {}, readings: payload?.readings || [],
    master_version: storedMasterVersion(payload),
    dashboard_data: Object.fromEntries(["natal_points", "natal_house_cusps", "reading_date", "display_timezone_name"].map(key => [key, dashboard[key]])),
  };
}
export function getStoredReadingForm() {
  if (privateMember) return memoryForm;
  try { return JSON.parse(window.localStorage.getItem(FORM_STORAGE_KEY)) || null; } catch { return null; }
}
export function storeReadingForm(payload) {
  if (privateMember) { memoryForm = payload; return; }
  try { window.localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(payload)); } catch { /* Calculation still works. */ }
}
export function getStoredReadingResult({ allowStale = false } = {}) {
  let payload = memoryResult;
  if (!payload && !privateMember) { try { payload = JSON.parse(window.localStorage.getItem(resultKey)); } catch { return null; } }
  return payload && (allowStale || isStoredResultFresh(payload)) ? payload : null;
}
export async function getStoredReadingResultAsync(options) { return getStoredReadingResult(options); }
export async function storeReadingResult(payload) {
  memoryResult = payload;
  if (privateMember) return;
  // Paid results stay in memory only; durable cache contains the free allow-list.
  try { window.localStorage.setItem(resultKey, JSON.stringify(freeResult(payload))); } catch { /* Preserve in memory. */ }
}

export function currentLocalDate() {
  return localDate();
}

export function clearReadingResult() {
  memoryResult = null;
  if (!privateMember) { try { window.localStorage.removeItem(resultKey); } catch { /* optional cache */ } }
}

function storedResultDate(payload) {
  return (
    payload?.timelineDate ||
    payload?.reading_date ||
    payload?.readingDate ||
    payload?.date ||
    payload?.meta?.reading_date ||
    payload?.meta?.date ||
    payload?.dashboard_data?.timelineDate ||
    payload?.dashboard_data?.reading_date ||
    payload?.dashboard_data?.readingDate ||
    payload?.yearly_forecast?.reading_date ||
    payload?.yearlyForecast?.reading_date ||
    payload?.storage_meta?.stored_date ||
    ""
  );
}

export function isStoredResultFresh(payload) {
  if (!isSameDisplayTimezone(payload)) return false;
  const savedDate = String(storedResultDate(payload) || "").slice(0, 10);
  if (!savedDate) {
    return true;
  }
  return savedDate === currentLocalDate();
}

export function storedMasterVersion(payload) {
  return String(
    payload?.master_version ||
      payload?.masterVersion ||
      payload?.dataVersion ||
      payload?.dashboard_data?.master_version ||
      payload?.dashboard_data?.masterVersion ||
      payload?.dashboardData?.master_version ||
      payload?.dashboardData?.masterVersion ||
      payload?.yearly_forecast?.master_version ||
      payload?.yearly_forecast?.masterVersion ||
      payload?.yearlyForecast?.master_version ||
      payload?.yearlyForecast?.masterVersion ||
      payload?.storage_meta?.master_version ||
      payload?.storage_meta?.masterVersion ||
      ""
  ).trim();
}

function normalizeRequestDate(value) {
  const match = String(value || "").trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() + 1 !== month
    || parsed.getUTCDate() !== day
  ) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeRequestTime(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function booleanValue(value) {
  if (typeof value === "string") {
    return ["1", "true", "on", "yes"].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}

function requiredCoordinate(value, label, min, max) {
  const numeric = String(value ?? "").trim() === "" ? Number.NaN : Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new Error(`${label}が保存されていません。入力画面から出生地を再検索してください。`);
  }
  return numeric;
}

export function normalizeReadingRequest(payload) {
  if (!payload || typeof payload !== "object") return payload;

  const fullName = String(payload.full_name || "").trim();
  if (!fullName) throw new Error("保存済みの氏名がありません。入力画面から再計算してください。");

  const birthDate = normalizeRequestDate(payload.birth_date);
  if (!birthDate) throw new Error("保存済みの生年月日が正しくありません。入力画面から再計算してください。");

  const birthTimeUnknown = booleanValue(payload.birth_time_unknown);
  const birthTime = birthTimeUnknown ? null : normalizeRequestTime(payload.birth_time);
  if (!birthTimeUnknown && !birthTime) {
    throw new Error("保存済みの出生時刻が正しくありません。入力画面から再計算してください。");
  }

  const birthplace = String(payload.resolved_birthplace || payload.birthplace || "").trim();
  if (!birthplace) throw new Error("保存済みの出生地がありません。入力画面から再計算してください。");

  const latitude = requiredCoordinate(payload.latitude, "緯度", -90, 90);
  const longitude = requiredCoordinate(payload.longitude, "経度", -180, 180);
  const timezoneName = String(payload.timezone_name || "").trim() || null;
  const timezoneText = String(payload.timezone_offset ?? "").trim();
  const timezoneOffset = timezoneText === "" ? null : Number(timezoneText);
  if (timezoneOffset !== null && (!Number.isFinite(timezoneOffset) || timezoneOffset < -12 || timezoneOffset > 14)) {
    throw new Error("保存済みのタイムゾーンが正しくありません。入力画面から出生地を再検索してください。");
  }
  if (timezoneOffset === null && !timezoneName) {
    throw new Error("保存済みのタイムゾーンがありません。入力画面から出生地を再検索してください。");
  }

  const { birth_prefecture: _birthPrefecture, resolved_birthplace: _resolvedBirthplace, ...rest } = payload;
  return {
    ...rest,
    full_name: fullName,
    birth_date: birthDate,
    birth_time: birthTime,
    birth_time_unknown: birthTimeUnknown,
    birthplace,
    latitude,
    longitude,
    timezone_offset: timezoneOffset,
    timezone_name: timezoneName,
    display_timezone_name: deviceTimezone(),
  };
}
