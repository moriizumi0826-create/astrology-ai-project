export const RESULT_STORAGE_KEY = "celestial-atelier:last-reading-result";
export const FORM_STORAGE_KEY = "celestial-atelier:last-reading-form";
const RESULT_DB_NAME = "celestial-atelier-results";
const RESULT_DB_VERSION = 1;
const RESULT_STORE_NAME = "reading-results";
const LATEST_RESULT_ID = "latest";

function currentTokyoDate() {
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
  const normalizedPayload = {
    ...payload,
    storage_meta: {
      ...(payload?.storage_meta || {}),
      stored_at: new Date().toISOString(),
      stored_date: String(savedDate).slice(0, 10),
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
