import { authClient, authMessage } from "./auth-client.mjs";
import { getJson } from "./api.mjs";
import { configureStorage, getStoredReadingForm } from "./reading-storage.js";
import { finishMemberLogin } from "./profile.mjs";
const $ = selector => document.querySelector(selector);
const recovery = new URLSearchParams(location.search).get("mode") === "recovery";
const failedLink = new URLSearchParams(location.search).has("error") || new URLSearchParams(location.hash.slice(1)).has("error");
configureStorage(null);
const anonymousForm = getStoredReadingForm();
let client;
(async () => {
  client = await authClient();
  history.replaceState(null, "", location.pathname + (recovery ? "?mode=recovery" : ""));
  const session = await getJson("/api/v3/session");
  if (failedLink || !session.user_id) throw new Error("確認リンクが無効・期限切れか、別のブラウザで開かれています。操作したブラウザで開くか、ログイン画面からメールを再送してください。");
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
