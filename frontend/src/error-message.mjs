const RECALCULATION_GUIDANCE =
  "通信に失敗しました。接続を確認して、このページでもう一度お試しください。";

const NETWORK_ERROR_PATTERN = /failed to fetch|networkerror|network request failed|load failed|api通信に失敗/i;

export function readableErrorMessage(error, fallback) {
  const message = error?.message || error;
  if (!message) return fallback;
  if (typeof message === "string") {
    return NETWORK_ERROR_PATTERN.test(message) ? RECALCULATION_GUIDANCE : message;
  }
  try {
    return JSON.stringify(message);
  } catch {
    return fallback;
  }
}
