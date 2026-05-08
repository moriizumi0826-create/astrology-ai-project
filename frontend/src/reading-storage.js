export const RESULT_STORAGE_KEY = "celestial-atelier:last-reading-result";

function parseStoredResult(raw) {
  if (!raw) {
    return null;
  }

  const payload = JSON.parse(raw);
  return payload && typeof payload === "object" ? payload : null;
}

export function getStoredReadingResult() {
  const stores = [window.sessionStorage, window.localStorage];

  for (const store of stores) {
    try {
      const payload = parseStoredResult(store.getItem(RESULT_STORAGE_KEY));
      if (payload) {
        return payload;
      }
    } catch {
      // Try the next available storage.
    }
  }

  return null;
}

export function storeReadingResult(payload) {
  const serialized = JSON.stringify(payload);
  const stores = [window.sessionStorage, window.localStorage];

  for (const store of stores) {
    try {
      store.setItem(RESULT_STORAGE_KEY, serialized);
    } catch {
      // The other storage may still be available.
    }
  }
}
