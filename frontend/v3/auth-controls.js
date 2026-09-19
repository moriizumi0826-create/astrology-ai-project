import { postJson } from "./api.mjs";
import { configureStorage, getStoredReadingForm } from "./reading-storage.js";
import { authClient, isMemberMode, authMessage } from "./auth-client.mjs";

export function mountAuthControls(session) {
  const bar = document.createElement("aside");
  bar.setAttribute("aria-label", "会員メニュー");
  bar.style.cssText = "position:sticky;top:0;z-index:260;display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:12px;padding:8px 16px;background:#121414;color:#eee9dd;font:12px sans-serif;border-bottom:1px solid #ffffff22";
  const label = document.createElement("span");
  label.textContent = isMemberMode() ? (session.user_id ? `ログイン中 · ${session.state === "paid" ? "有料会員" : "無料会員"}` : "未ログイン · 無料版") : session.state === "paid" ? "ローカル検証 · テストユーザー（有料）" : "ローカル検証 · 無料";
  bar.append(label);
  if (session.user_id) {
    if (isMemberMode()) {
      const billing = document.createElement("a");
      billing.href = "/billing.html";
      billing.textContent = session.state === "paid" ? "契約管理" : "有料プラン";
      billing.style.color = "#e9c349";
      bar.append(billing);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "ログアウト";
    button.style.cssText = "color:#e9c349;padding:4px 8px;border:1px solid #e9c34966;border-radius:5px;cursor:pointer";
    button.onclick = async () => {
      button.disabled = true;
      try {
        let next;
        if (isMemberMode()) {
          const client = await authClient();
          const { error } = await client.auth.signOut({ scope: "local" });
          if (error) throw new Error(authMessage(error));
          next = null;
        } else next = await postJson("/api/v3/test-auth/logout", {});
        configureStorage(next);
        const target = new URL(getStoredReadingForm() ? "/index.html#horoscope" : "/entry.html", location.origin);
        if (target.pathname === location.pathname) {
          // Changing only the hash does not remount the app or clear paid state.
          history.replaceState(null, "", target.href);
          location.reload();
        } else {
          location.assign(target.href);
        }
      } catch (error) {
        label.textContent = error.message;
        label.setAttribute("role", "alert");
        button.disabled = false;
      }
    };
    bar.append(button);
  } else {
    const link = document.createElement("a");
    link.href = "/login.html";
    link.textContent = isMemberMode() ? "ログイン・新規登録" : "テストログイン";
    link.style.color = "#e9c349";
    bar.append(link);
  }
  document.body.prepend(bar);
  const updateHeight = () => document.documentElement.style.setProperty("--v3-auth-bar-height", `${bar.getBoundingClientRect().height}px`);
  const observer = new ResizeObserver(updateHeight);
  observer.observe(bar);
  updateHeight();
  return () => {
    observer.disconnect();
    bar.remove();
    document.documentElement.style.removeProperty("--v3-auth-bar-height");
  };
}
