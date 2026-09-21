import "./tailwind.css";
import { configureStorage } from "./reading-storage.js";
import { prepareSession } from "./profile.mjs";
if (__APP_ENVIRONMENT__ === "preview") {
  const note = document.querySelector("#environment-note");
  const label = document.querySelector("#environment-label");
  note.textContent = "テスト運用版です";
  note.hidden = false;
  label.textContent = "Test Operation";
  label.hidden = false;
}
const button = document.querySelector('button[type="submit"]');
button.disabled = true;
prepareSession().then(async session => {
  configureStorage(session);
  if (String(session.user_id || "").startsWith("supabase:")) {
    const notice = document.createElement("p");
    notice.textContent = "計算完了時に、この出生情報をログイン中のアカウントへ保存します。";
    notice.className = "entry-member-notice";
    button.before(notice);
  }
  window.addEventListener("v3-auth-changed", () => { configureStorage(null); location.replace("/login.html"); });
  await import("./entry-form.js");
  button.disabled = false;
}).catch(error => {
  const box = document.querySelector("#error-box");
  box.textContent = `V3 APIに接続できません。時間をおいて再読み込みしてください。${error.message}`;
  box.classList.remove("hidden");
});
