export const RESULT_STORAGE_KEY = "celestial-atelier:last-reading-result";
export const FORM_STORAGE_KEY = "celestial-atelier:last-reading-form";

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

export function storeReadingResult(payload) {
  const savedDate = storedResultDate(payload) || currentTokyoDate();
  const serialized = JSON.stringify({
    ...payload,
    storage_meta: {
      ...(payload?.storage_meta || {}),
      stored_at: new Date().toISOString(),
      stored_date: String(savedDate).slice(0, 10),
    },
  });
  const stores = [window.sessionStorage, window.localStorage];

  for (const store of stores) {
    try {
      store.setItem(RESULT_STORAGE_KEY, serialized);
    } catch {
      // The other storage may still be available.
    }
  }
}
