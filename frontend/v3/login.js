import { authClient, authMessage, initializeAuth } from "./auth-client.mjs";
import { getJson } from "./api.mjs";
import { configureStorage, getStoredReadingForm } from "./reading-storage.js";
import { finishMemberLogin } from "./profile.mjs";
import { captchaTokenForRequest, initializeCaptcha, resetCaptcha } from "./captcha.mjs";

const $ = selector => document.querySelector(selector);
const form = $("#member-form"), button = $("#submit"), status = $("#status"), errorBox = $("#error");
let mode = "login", client, busy = false, ready = false, sent = false, sentEmail = "";
const labels = { login: "ログイン", signup: "新規登録", reset: "再設定メールを送信" };
configureStorage(null);
const anonymousForm = getStoredReadingForm();
const destination = () => getStoredReadingForm() ? "/index.html#horoscope" : "/entry.html";
function clearFeedback() { errorBox.textContent = ""; status.textContent = ""; }
function setBusy(value) {
  busy = value;
  document.querySelectorAll("button:not(#retry), #email, #password, #transfer").forEach(item => { item.disabled = value || !ready; });
  form.setAttribute("aria-busy", String(value));
  button.textContent = value ? (mode === "login" ? "ログイン中…" : "送信中…") : labels[mode];
  $("#resend").textContent = value ? "送信中…" : "確認メールを再送";
}
function setMode(next) {
  if (busy) return;
  if (mode !== next) $("#password").value = "";
  mode = next; sent = false; clearFeedback();
  $("#heading").textContent = next === "reset" ? "パスワードの再設定" : labels[next];
  document.title = `${$("#heading").textContent} | The Celestial Atelier`;
  $("#description").textContent = { login: "アカウントにログインして、続きを楽しみましょう。", signup: "無料でアカウントを作成し、出生情報を保存できます。", reset: "登録したメールアドレスへ、再設定用のリンクを送ります。" }[next];
  $("nav").hidden = next === "reset";
  $("#fields").hidden = false; $("#email-sent").hidden = true;
  $("#password-row").hidden = next === "reset";
  $("#password").required = next !== "reset";
  $("#password").minLength = next === "signup" ? 12 : 1;
  $("#password").autocomplete = next === "signup" ? "new-password" : "current-password";
  $("#password").type = "password";
  $("#show-password").textContent = "表示";
  $("#show-password").setAttribute("aria-pressed", "false");
  $("#show-password").setAttribute("aria-label", "パスワードを表示");
  $("#password").setAttribute("aria-describedby", next === "signup" ? "signup-note error" : "error");
  $("#signup-note").hidden = next !== "signup";
  $("#signup-campaign").hidden = next !== "signup" || Date.now() >= Date.parse("2026-11-01T00:00:00+09:00");
  $("#forgot").hidden = next !== "login";
  $("#transfer-row").hidden = next !== "login" || !anonymousForm;
  $("#back-login").hidden = next !== "reset";
  button.hidden = false; $("#resend").hidden = true; $("#edit-email").hidden = true;
  document.querySelectorAll("nav [data-mode]").forEach(item => item.setAttribute("aria-pressed", String(item.dataset.mode === next)));
  setBusy(false);
}
function showError(error) { errorBox.textContent = error?.status ? error.message : authMessage(error); }
function showSent(email) {
  sent = true; sentEmail = email;
  $("#password").value = "";
  $("#heading").textContent = "メールをご確認ください";
  $("#description").textContent = "メール内のリンクから、手続きを続けてください。";
  $("#fields").hidden = true; $("nav").hidden = true;
  $("#email-sent").hidden = false; $("#sent-email").textContent = email;
  $("#sent-note").textContent = mode === "signup"
    ? "登録可能な場合は確認メールが届きます。登録済みの場合はログイン、またはパスワード再設定をご利用ください。"
    : "登録済みのメールアドレスであれば、再設定メールが届きます。";
  button.hidden = true; $("#resend").hidden = false; $("#edit-email").hidden = false; $("#back-login").hidden = false;
  $("#heading").focus();
}
async function initialize() {
  try {
    const config = await initializeAuth();
    if (__APP_ENVIRONMENT__ === "local" && config.mode === "local_test") { location.replace("/test-login.html"); return; }
    client = await authClient();
    let session;
    try { session = await getJson("/api/v3/session"); }
    catch (error) {
      if (![401, 403].includes(error.status)) throw error;
      await client.auth.signOut({ scope: "local" }); session = {};
    }
    if (session.user_id) {
      const { data, error } = await client.auth.getUser();
      if (error) throw error;
      $("#account-email").textContent = data.user?.email || "メールアドレスを取得できませんでした。";
      $("#heading").textContent = "ログイン済みです";
      $("#description").textContent = "このアカウントでご利用いただけます。";
      $("#signed-in").hidden = false;
      $(".auth-card").removeAttribute("data-loading");
    } else {
      $("#auth-content").hidden = false;
      $("#loading").hidden = true;
      $(".auth-card").removeAttribute("data-loading");
      await initializeCaptcha($("#captcha"));
    }
    ready = true; setBusy(false); $("#loading").hidden = true;
  } catch (error) {
    $("#loading p").textContent = "接続を確認できませんでした。再読み込みしてお試しください。";
    $("#retry").hidden = false; showError(error);
    $(".feedback").append($("#retry"));
  }
}
setMode("login");
initialize();
$("#retry").addEventListener("click", () => location.reload());
document.querySelectorAll("[data-mode]").forEach(item => item.addEventListener("click", () => { setMode(item.dataset.mode); $("#heading").focus(); }));
$("#show-password").addEventListener("click", () => {
  const show = $("#password").type === "password";
  $("#password").type = show ? "text" : "password";
  $("#show-password").textContent = show ? "隠す" : "表示";
  $("#show-password").setAttribute("aria-pressed", String(show));
  $("#show-password").setAttribute("aria-label", show ? "パスワードを隠す" : "パスワードを表示");
});
$("#edit-email").addEventListener("click", () => { setMode(mode); $("#email").focus(); });
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!ready || busy || sent) return;
  clearFeedback(); setBusy(true);
  const email = $("#email").value.trim(), password = $("#password").value;
  let navigating = false;
  try {
    const captchaToken = captchaTokenForRequest();
    if (mode === "login") {
      const { error } = await client.auth.signInWithPassword({ email, password, options: { captchaToken } });
      if (error) throw error;
      await finishMemberLogin(anonymousForm, $("#transfer").checked);
      $("#password").value = "";
      location.assign(destination());
      navigating = true;
      return;
    }
    const { error } = mode === "signup"
      ? await client.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth-callback.html`, captchaToken } })
      : await client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth-callback.html`, captchaToken });
    if (error) throw error;
    showSent(email);
  } catch (error) { showError(error); }
  finally { if (!navigating) { resetCaptcha(); setBusy(false); } }
});
$("#resend").addEventListener("click", async () => {
  if (busy || !sent) return;
  clearFeedback(); setBusy(true);
  try {
    const captchaToken = captchaTokenForRequest();
    const { error } = mode === "signup"
      ? await client.auth.resend({ type: "signup", email: sentEmail, options: { emailRedirectTo: `${location.origin}/auth-callback.html`, captchaToken } })
      : await client.auth.resetPasswordForEmail(sentEmail, { redirectTo: `${location.origin}/auth-callback.html`, captchaToken });
    if (error) throw error;
    status.textContent = "送信可能な場合はメールが届きます。";
  } catch (error) { showError(error); }
  finally { resetCaptcha(); setBusy(false); }
});
$("#signout").addEventListener("click", async () => {
  if (busy) return;
  clearFeedback(); setBusy(true);
  try {
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw error;
    configureStorage(null); location.replace("/login.html");
  } catch (error) { showError(error); setBusy(false); }
});
