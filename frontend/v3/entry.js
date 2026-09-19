import { configureStorage } from "./reading-storage.js";
import { prepareSession } from "./profile.mjs";
const button = document.querySelector('button[type="submit"]');
button.disabled = true;
prepareSession().then(async session => {
  configureStorage(session);
  if (String(session.user_id || "").startsWith("supabase:")) {
    const notice = document.createElement("p");
    notice.textContent = "計算完了時に、この出生情報をログイン中のアカウントへ保存します。";
    notice.style.cssText = "font-size:13px;margin:12px 0";
    button.before(notice);
  }
  window.addEventListener("v3-auth-changed", () => { configureStorage(null); location.replace("/login.html"); });
  await import("./entry-form.js");
  button.disabled = false;
}).catch(error => {
  const box = document.querySelector("#error-box");
  box.textContent = `V3検証APIに接続できません。起動を確認して再読み込みしてください。${error.message}`;
  box.classList.remove("hidden");
});
