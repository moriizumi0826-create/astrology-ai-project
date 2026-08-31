const TRANSIENT_NETWORK_ERROR_PATTERN = /failed to fetch|networkerror|network request failed|load failed|api通信に失敗/i;
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 502, 503, 504]);

export function isTransientRequestError(error) {
  const status = Number(error?.status);
  if (Number.isFinite(status) && TRANSIENT_HTTP_STATUSES.has(status)) return true;
  const message = String(error?.message || error || "");
  return TRANSIENT_NETWORK_ERROR_PATTERN.test(message);
}

export async function retryTransientRequest(
  request,
  {
    attempts = 4,
    delays = [2000, 5000, 10000],
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {},
) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (!isTransientRequestError(error) || attempt >= attempts - 1) throw error;
      const delay = delays[Math.min(attempt, Math.max(0, delays.length - 1))] || 0;
      if (delay > 0) await wait(delay);
    }
  }
  throw lastError;
}

export function createSingleFlightRequester() {
  const requests = new Map();
  return (key, request) => {
    if (requests.has(key)) return requests.get(key);
    const promise = Promise.resolve()
      .then(request)
      .finally(() => {
        if (requests.get(key) === promise) requests.delete(key);
      });
    requests.set(key, promise);
    return promise;
  };
}
