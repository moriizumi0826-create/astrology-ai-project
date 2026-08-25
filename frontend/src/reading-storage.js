export const RESULT_STORAGE_KEY = "celestial-atelier:last-reading-result";
export const FORM_STORAGE_KEY = "celestial-atelier:last-reading-form";
const RESULT_DB_NAME = "celestial-atelier-results";
const RESULT_DB_VERSION = 1;
const RESULT_STORE_NAME = "reading-results";
const LATEST_RESULT_ID = "latest";

export function currentTokyoDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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
  const savedDate = String(storedResultDate(payload) || "").slice(0, 10);
  if (!savedDate) {
    return true;
  }
  return savedDate === currentTokyoDate();
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
  };
}

function parseStoredResult(raw) {
  if (!raw) {
    return null;
  }

  const payload = JSON.parse(raw);
  return payload && typeof payload === "object" ? payload : null;
}

function slimResultPayload(payload) {
  const { yearly_forecast, yearlyForecast, ...rest } = payload || {};
  return {
    ...rest,
    storage_meta: {
      ...(payload?.storage_meta || {}),
      yearly_forecast_storage: yearly_forecast || yearlyForecast ? "indexeddb" : "none",
    },
  };
}

function openResultDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available."));
      return;
    }

    const request = window.indexedDB.open(RESULT_DB_NAME, RESULT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RESULT_STORE_NAME)) {
        db.createObjectStore(RESULT_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB."));
  });
}

async function writeIndexedResult(payload) {
  const db = await openResultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RESULT_STORE_NAME, "readwrite");
    tx.objectStore(RESULT_STORE_NAME).put({
      id: LATEST_RESULT_ID,
      payload,
      updated_at: new Date().toISOString(),
    });
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Failed to write IndexedDB."));
    };
  });
}

async function readIndexedResult() {
  const db = await openResultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RESULT_STORE_NAME, "readonly");
    const request = tx.objectStore(RESULT_STORE_NAME).get(LATEST_RESULT_ID);
    request.onsuccess = () => resolve(request.result?.payload || null);
    request.onerror = () => reject(request.error || new Error("Failed to read IndexedDB."));
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

async function deleteIndexedResult() {
  const db = await openResultDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RESULT_STORE_NAME, "readwrite");
    tx.objectStore(RESULT_STORE_NAME).delete(LATEST_RESULT_ID);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Failed to delete IndexedDB."));
    };
  });
}

export function getStoredReadingResult({ allowStale = false } = {}) {
  const stores = [window.sessionStorage, window.localStorage];

  for (const store of stores) {
    try {
      const payload = parseStoredResult(store.getItem(RESULT_STORAGE_KEY));
      if (payload) {
        if (allowStale || isStoredResultFresh(payload)) {
          return payload;
        }
        store.removeItem(RESULT_STORAGE_KEY);
      }
    } catch {
      // Try the next available storage.
    }
  }

  return null;
}

export async function getStoredReadingResultAsync({ allowStale = false } = {}) {
  try {
    const indexedPayload = await readIndexedResult();
    if (indexedPayload) {
      if (allowStale || isStoredResultFresh(indexedPayload)) {
        return indexedPayload;
      }
      await deleteIndexedResult().catch(() => {});
    }
  } catch {
    // Fall back to Web Storage.
  }

  return getStoredReadingResult({ allowStale });
}

export function getStoredReadingForm() {
  try {
    const raw = window.localStorage.getItem(FORM_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const payload = JSON.parse(raw);
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

export async function storeReadingResult(payload) {
  const savedDate = storedResultDate(payload) || currentTokyoDate();
  const masterVersion = storedMasterVersion(payload);
  const normalizedPayload = {
    ...payload,
    ...(masterVersion ? { master_version: masterVersion, masterVersion } : {}),
    storage_meta: {
      ...(payload?.storage_meta || {}),
      stored_at: new Date().toISOString(),
      stored_date: String(savedDate).slice(0, 10),
      ...(masterVersion ? { master_version: masterVersion, masterVersion } : {}),
    },
  };
  await writeIndexedResult(normalizedPayload).catch(() => {});
  const serialized = JSON.stringify(slimResultPayload(normalizedPayload));
  const stores = [window.sessionStorage, window.localStorage];

  for (const store of stores) {
    try {
      store.setItem(RESULT_STORAGE_KEY, serialized);
    } catch {
      // The other storage may still be available.
    }
  }
}
