import { deleteJson, getJson } from "./api.mjs";
import { authClient, authMessage, initializeAuth, isMemberMode } from "./auth-client.mjs";
import { deleteMemberProfile } from "./profile.mjs";
import { configureStorage } from "./reading-storage.js";

const status = document.querySelector("#status");
const accountEmail = document.querySelector("#account-email");
const errorBox = document.querySelector("#error");
const deleteProfileButton = document.querySelector("#delete-profile");
const deleteAccountButton = document.querySelector("#delete-account");
const password = document.querySelector("#current-password");
const confirmation = document.querySelector("#delete-confirmation");
const subscriptionNote = document.querySelector("#subscription-note");
let email = "";
let blockedBySubscription = true;
let birthEditor;
let profileBusy = false;

function showError(error) {
  errorBox.textContent = error?.message || "処理を完了できませんでした。";
  errorBox.hidden = false;
}

function syncDeleteButton() {
  deleteAccountButton.disabled = profileBusy || blockedBySubscription || !password.value || confirmation.value !== "アカウントを削除";
}

function blockingSubscription(subscription) {
  return Boolean(subscription && ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"].includes(subscription.status));
}

async function load() {
  try {
    await initializeAuth();
    if (!isMemberMode()) throw new Error("この画面は会員アカウント専用です。");
    const client = await authClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user?.email) { location.replace("/login.html"); return; }
    email = data.user.email;
    accountEmail.textContent = email;
    const [{ saved }, billing] = await Promise.all([
      getJson("/api/v3/profile"),
      getJson("/api/v3/billing/status"),
    ]);
    status.textContent = saved ? "出生情報がアカウントに保存されています。" : "保存済みの出生情報はありません。";
    deleteProfileButton.disabled = !saved;
    blockedBySubscription = blockingSubscription(billing.subscription);
    subscriptionNote.textContent = blockedBySubscription
      ? "契約または支払い処理が残っています。先に契約管理画面で状態を確認し、利用期間終了後にアカウントを削除してください。"
      : "削除を進められる契約状態です。安全確認のため、現在のパスワードで再認証します。";
    document.querySelector("#billing-link").textContent = billing.customer ? "契約・支払い状態を確認する" : "有料プランを確認する";
    syncDeleteButton();
    const { mountBirthEditor } = await import("./account-birth-editor.jsx");
    birthEditor = await mountBirthEditor(document.querySelector("#profile-editor"), {
      onSaved() {
        status.textContent = "出生情報をアカウントに保存しました。";
        deleteProfileButton.dataset.saved = "true";
        errorBox.hidden = true;
      },
      onBusyChange(busy) {
        profileBusy = busy;
        deleteProfileButton.disabled = busy || deleteProfileButton.dataset.saved !== "true";
        syncDeleteButton();
      },
    });
    deleteProfileButton.dataset.saved = String(Boolean(saved));
  } catch (error) {
    status.textContent = "保存状態を確認できません。";
    showError(error);
    document.querySelector("#profile-editor").textContent = "編集フォームを表示できません。再読み込みしてください。";
  }
}

deleteProfileButton.addEventListener("click", async () => {
  if (profileBusy) return;
  if (!confirm("アカウントに保存済みの出生情報を削除しますか？")) return;
  deleteProfileButton.disabled = true;
  document.querySelector("#profile-editor").inert = true;
  errorBox.hidden = true;
  try {
    const result = await deleteMemberProfile();
    deleteProfileButton.dataset.saved = "false";
    birthEditor?.reset();
    status.textContent = result.deleted ? "保存済みの出生情報を削除しました。" : "保存済みの出生情報はありません。";
  } catch (error) {
    showError(error);
    deleteProfileButton.disabled = false;
  } finally {
    document.querySelector("#profile-editor").inert = false;
  }
});

deleteAccountButton.addEventListener("click", async () => {
  if (!confirm("アカウントを完全に削除します。この操作は元に戻せません。続けますか？")) return;
  deleteAccountButton.disabled = true;
  errorBox.hidden = true;
  try {
    const client = await authClient();
    const { error: signInError } = await client.auth.signInWithPassword({ email, password: password.value });
    if (signInError) throw new Error(authMessage(signInError));
    await deleteJson("/api/v3/account", { confirmation: confirmation.value });
    await client.auth.signOut({ scope: "local" });
    configureStorage(null);
    location.replace("/entry.html?account=deleted");
  } catch (error) {
    showError(error);
    password.value = "";
    syncDeleteButton();
  }
});

password.addEventListener("input", syncDeleteButton);
confirmation.addEventListener("input", syncDeleteButton);
load();
