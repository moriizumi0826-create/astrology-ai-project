const siteKey = String(typeof __APP_TURNSTILE_SITE_KEY__ === "undefined"
  ? ""
  : __APP_TURNSTILE_SITE_KEY__ || "").trim();

let scriptPromise;
let widgetId = null;
let token = "";

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-v3-turnstile]');
      const script = existing || document.createElement("script");
      const complete = () => window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error("不正アクセス防止機能を読み込めませんでした。再読み込みしてください。"));
      script.addEventListener("load", complete, { once: true });
      script.addEventListener("error", () => reject(new Error("不正アクセス防止機能を読み込めませんでした。通信状態を確認してください。")), { once: true });
      if (!existing) {
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.v3Turnstile = "";
        document.head.append(script);
      }
    });
  }
  return scriptPromise;
}

export async function initializeCaptcha(container) {
  if (!siteKey) return;
  container.hidden = false;
  const turnstile = await loadTurnstile();
  widgetId = turnstile.render(container, {
    sitekey: siteKey,
    theme: "dark",
    size: window.matchMedia("(max-width: 380px)").matches ? "compact" : "flexible",
    callback: value => { token = value; },
    "expired-callback": () => { token = ""; },
    "error-callback": () => { token = ""; },
  });
}

export function captchaTokenForRequest() {
  if (!siteKey) return undefined;
  if (!token) {
    const error = new Error("不正アクセス防止の確認を完了してください。");
    error.code = "captcha_required";
    throw error;
  }
  return token;
}

export function resetCaptcha() {
  token = "";
  if (widgetId !== null && window.turnstile) window.turnstile.reset(widgetId);
}
