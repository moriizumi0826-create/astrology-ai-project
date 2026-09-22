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
configureStorage(null);
const anonymousForm = getStoredReadingForm();
let client;
(async () => {
  client = await authClient();
  if (tokenHash) {
    if (!["email", "recovery"].includes(tokenType)) throw new Error("確認リンクの種類を判別できません。ログイン画面からメールを再送してください。");
    const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: tokenType });
    if (error) throw new Error("確認リンクが無効または期限切れです。ログイン画面からメールを再送してください。");
  }
  history.replaceState(null, "", location.pathname + (recovery ? "?mode=recovery" : ""));
  const session = await getJson("/api/v3/session");
  if (failedLink || !session.user_id) throw new Error("確認リンクが無効または期限切れです。ログイン画面からメールを再送してください。");
  $("#status").textContent = recovery ? "新しいパスワードを設定してください（12文字以上）。" : "メールを確認しました。会員登録は無料です。";
  $("#heading").textContent = recovery ? "パスワード再設定" : "メール確認完了";
  $("#password-row").hidden = !recovery;
  $("#new-password").required = recovery;
  $("#transfer-row").hidden = recovery || !anonymousForm;
  $("#submit").textContent = recovery ? "パスワードを更新" : "ホロスコープへ進む";
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
      await finishMemberLogin(anonymousForm, $("#transfer").checked);
      location.replace(getStoredReadingForm() ? "/index.html#horoscope" : "/entry.html");
    }
  } catch (error) { $("#error").textContent = error?.status ? error.message : authMessage(error); $("#error").hidden = false; $("#submit").disabled = false; }
});
