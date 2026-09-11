export class RequestTimeoutError extends Error {
  constructor() {
    super("計算サーバーからの応答がありません。入力内容は保持されています。しばらく待ってから、もう一度お試しください。");
    this.name = "RequestTimeoutError";
  }
}

// Bound both the connection wait and response-body download.
export async function requestJsonWithTimeout(url, options, timeoutMs = 90000) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new RequestTimeoutError());
      controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { ...options, signal: controller.signal });
        const contentType = response.headers.get("content-type") || "";
        const data = contentType.includes("application/json")
          ? await response.json()
          : { detail: await response.text() };
        return { response, data };
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
