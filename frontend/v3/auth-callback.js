import { authClient, authMessage } from "./auth-client.mjs";
import { getJson } from "./api.mjs";
import { configureStorage, getStoredReadingForm } from "./reading-storage.js";
import { finishMemberLogin } from "./profile.mjs";
const $ = selector => document.querySelector(selector);
const query = new URLSearchParams(location.search);
const hash = new URLSearchParams(location.hash.slice(1));
const tokenHash = query.get("token_hash");
const tokenType = query.get("type");
const recovery = tokenType === "recovery" || query.get("mode") === "recovery";
const failedLink = query.has("error") || hash.has("error");
const googleLogin = query.get("mode") === "google";
let client;
(async () => {
  if (googleLogin && failedLink) throw new Error("Googleログインがキャンセルされたか、認証を完了できませんでした。ログイン画面からもう一度お試しください。");
  client = await authClient();
  if (tokenHash) {
    if (!["email", "recovery"].includes(tokenType)) throw new Error("確認リンクの種類を判別できません。ログイン画面からメールを再送してください。");
    const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: tokenType });
    if (error) throw new Error("確認リンクが無効または期限切れです。ログイン画面からメールを再送してください。");
  }
  history.replaceState(null, "", location.pathname + (recovery ? "?mode=recovery" : ""));
  const session = await getJson("/api/v3/session");
  if (failedLink || !session.user_id) throw new Error(googleLogin ? "Googleログインを確認できませんでした。ログイン画面からもう一度お試しください。" : "確認リンクが無効または期限切れです。ログイン画面からメールを再送してください。");
  $("#status").textContent = recovery ? "新しいパスワードを設定してください（12文字以上）。"
    : session.access_source === "invite" ? "メールを確認しました。招待特典で有料機能を利用できます。"
    : "メールを確認しました。会員登録は無料です。";
  $("#heading").textContent = recovery ? "パスワード再設定" : "メール確認完了";
  if (googleLogin) {
    $("#heading").textContent = "Googleログイン完了";
    document.title = "Googleログイン完了 | The Celestial Atelier";
    $("#status").textContent = session.access_source === "invite" ? "招待特典で有料機能を利用できます。" : "Googleアカウントでログインしました。";
  }
  $("#password-row").hidden = !recovery;
  $("#new-password").required = recovery;
  $("#submit").textContent = recovery ? "パスワードを更新" : "ホロスコープへ進む";
  if (!recovery) {
    await finishMemberLogin(null, false);
    if (!getStoredReadingForm()) {
      $("#heading").textContent = "出生データの登録";
      $("#status").textContent = "あなたの出生データを登録します。保存後、ホロスコープを表示します。";
      const container = $("#profile-editor");
      container.hidden = false;
      container.textContent = "入力フォームを読み込んでいます…";
      const { mountBirthEditor } = await import("./account-birth-editor.jsx");
      await mountBirthEditor(container, {
        purpose: "onboarding",
        onSaved() { location.replace("/index.html#horoscope"); },
      });
      return;
    }
  }
  $("#callback-form").hidden = false;
})().catch(error => { history.replaceState(null, "", location.pathname); $("#status").hidden = true; $("#error").textContent = error.message; $("#error").hidden = false; });
$("#callback-form").addEventListener("submit", async event => {
  event.preventDefault(); $("#submit").disabled = true;
  try {
    if (recovery) {
      const { error } = await client.auth.updateUser({ password: $("#new-password").value });
      if (error) throw error;
      $("#new-password").value = "";
      const { error: logoutError } = await client.auth.signOut({ scope: "global" });
      if (logoutError) throw logoutError;
      configureStorage(null); location.replace("/login.html");
    } else {
      await finishMemberLogin(null, false);
      location.replace(getStoredReadingForm() ? "/index.html#horoscope" : "/auth-callback.html?mode=onboarding");
    }
  } catch (error) { $("#error").textContent = error?.status ? error.message : authMessage(error); $("#error").hidden = false; $("#submit").disabled = false; }
});
