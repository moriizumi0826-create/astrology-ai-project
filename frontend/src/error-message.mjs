const RECALCULATION_GUIDANCE =
  "通信に失敗しました。前のページに戻り、出生データを読み込み直して再計算してください。";

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
