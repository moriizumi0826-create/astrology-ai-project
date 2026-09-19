import { authClient, authMessage, initializeAuth } from "./auth-client.mjs";
import { getJson } from "./api.mjs";
import { configureStorage, getStoredReadingForm } from "./reading-storage.js";
import { finishMemberLogin } from "./profile.mjs";

const $ = selector => document.querySelector(selector);
const form = $("#member-form"), button = $("#submit"), status = $("#status"), errorBox = $("#error");
let mode = "login", client;
configureStorage(null);
const anonymousForm = getStoredReadingForm();
const destination = () => getStoredReadingForm() ? "/index.html#horoscope" : "/entry.html";
function setMode(next) {
  mode = next;
  const label = { login: "ログイン", signup: "新規登録", reset: "再設定メールを送信" }[mode];
  $("#heading").textContent = label; button.textContent = label;
  $("#password-row").hidden = mode === "reset";
  $("#password").required = mode !== "reset";
  $("#password").minLength = mode === "signup" ? 12 : 1;
  $("#password").autocomplete = mode === "signup" ? "new-password" : "current-password";
  $("#signup-note").hidden = mode !== "signup";
  $("#transfer-row").hidden = mode !== "login" || !anonymousForm;
  document.querySelectorAll("[data-mode]").forEach(item => item.setAttribute("aria-pressed", String(item.dataset.mode === mode)));
  errorBox.hidden = true; status.hidden = true;
}
function showError(error) { errorBox.textContent = error?.status ? error.message : authMessage(error); errorBox.hidden = false; }
initializeAuth().then(async config => {
  if (config.mode === "local_test") { location.replace("/test-login.html"); return; }
  client = await authClient();
  let session;
  try { session = await getJson("/api/v3/session"); }
  catch (error) {
    if (![401, 403].includes(error.status)) throw error;
    await client.auth.signOut({ scope: "local" });
    session = {};
  }
  if (session.user_id) { form.hidden = true; $("nav").hidden = true; $("#signed-in").hidden = false; }
  setMode("login"); button.disabled = false;
}).catch(error => { status.textContent = "認証設定を確認できません。再読み込みしてください。"; showError(error); });
document.querySelectorAll("[data-mode]").forEach(item => item.addEventListener("click", () => setMode(item.dataset.mode)));
form.addEventListener("submit", async event => {
  event.preventDefault(); button.disabled = true; errorBox.hidden = true; status.hidden = false; status.textContent = "処理しています…";
  const email = $("#email").value.trim(), password = $("#password").value;
  try {
    if (mode === "login") {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await finishMemberLogin(anonymousForm, $("#transfer").checked);
      location.assign(destination());
    } else if (mode === "signup") {
      const { error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth-callback.html` } });
      if (error) throw error;
      status.textContent = "登録可能な場合は確認メールが届きます。このブラウザでメールのリンクを開いてください。登録済みの場合はログインまたはパスワード再設定をご利用ください。";
      $("#resend").hidden = false;
    } else {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth-callback.html?mode=recovery` });
      if (error) throw error;
      status.textContent = "登録済みのメールアドレスであれば再設定メールが届きます。このブラウザでリンクを開いてください。";
    }
  } catch (error) { status.hidden = true; showError(error); }
  finally { $("#password").value = ""; button.disabled = false; }
});
$("#resend").addEventListener("click", async () => {
  $("#resend").disabled = true;
  try {
    if (!$("#email").reportValidity()) return;
    const { error } = await client.auth.resend({ type: "signup", email: $("#email").value.trim(), options: { emailRedirectTo: `${location.origin}/auth-callback.html` } });
    if (error) throw error;
    status.textContent = "送信可能な場合は確認メールが届きます。"; status.hidden = false;
  } catch (error) { showError(error); }
  finally { $("#resend").disabled = false; }
});
$("#signout").addEventListener("click", async () => {
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) { showError(error); return; }
  configureStorage(null); location.replace("/login.html");
});
