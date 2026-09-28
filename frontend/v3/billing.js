import { getJson, postJson } from "./api.mjs";
import { initializeAuth } from "./auth-client.mjs";
import { billingMessage, canShowCheckoutPlan, canStartCheckout } from "./billing-state.mjs";

const billingCopy = __APP_ENVIRONMENT__ === "production" ? {
  mode: "live",
  button: "月額400円で申し込む",
} : {
  mode: "test",
  button: "テスト決済へ",
};
const state = document.querySelector("#state");
const errorBox = document.querySelector("#error");
const planButtons = [...document.querySelectorAll("[data-currency]")];
const portalButton = document.querySelector("#portal");
const refreshButton = document.querySelector("#refresh");
const modeNote = document.querySelector("#billing-mode-note");
const plans = document.querySelector("#plans");
const trialNote = document.querySelector("#trial-note");
let checkoutReady = false;

function safeStripeUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".stripe.com")) throw new Error("Stripeの遷移先を確認できません。");
  return url.href;
}
function showError(error) { errorBox.textContent = error.message; errorBox.hidden = false; }
async function load() {
  errorBox.hidden = true; refreshButton.disabled = true;
  checkoutReady = false;
  state.textContent = "契約状態を確認しています…";
  modeNote.textContent = "";
  plans.hidden = true;
  portalButton.hidden = true;
  planButtons.forEach(button => { button.disabled = true; });
  try {
    await initializeAuth();
    const session = await getJson("/api/v3/session");
    if (!session.user_id) { location.replace("/login.html"); return; }
    const billing = await getJson("/api/v3/billing/status");
    if (billing.mode !== billingCopy.mode) throw new Error("決済環境の設定が一致しません。申し込みを停止しました。");
    state.textContent = billingMessage(billing);
    const trial = billing.trial_days === 30;
    modeNote.textContent = billingCopy.mode === "test"
      ? "現在はStripeテストモードです。テストカード以外で実際の支払いは行いません。"
      : "月額400円の自動更新プランです。年額プランはありません。";
    if (billing.access_state === "owner") modeNote.textContent = "確認用アカウントのため、新たな申し込みは不要です。";
    else if (billing.access_state === "invite") modeNote.textContent = "招待特典で利用中のため、新たな申し込みは不要です。";
    else if (!billing.checkout_enabled) modeNote.textContent = "現在、新規の有料プラン申し込みを停止しています。既存契約の管理は引き続き利用できます。";
    trialNote.textContent = trial
      ? "今回のお申し込みはカード登録後30日間無料です。期間内に解約しなければ、Stripeの決済画面に表示される初回請求日に400円、その後毎月400円が請求されます。"
      : "無料お試しの対象外の場合は申込時に400円、その後毎月400円が請求されます。初回請求日はStripeの決済画面でご確認ください。";
    checkoutReady = canStartCheckout(billing);
    plans.hidden = !canShowCheckoutPlan(billing);
    planButtons.forEach(button => {
      button.textContent = trial ? "30日間無料で試す" : billingCopy.button;
      button.disabled = !checkoutReady;
    });
    portalButton.hidden = !billing.customer;
  } catch (error) {
    state.textContent = "契約状態を確認できません。申し込みと契約管理は一時停止しています。";
    showError(error);
  }
  finally { refreshButton.disabled = false; }
}
planButtons.forEach(button => button.addEventListener("click", async () => {
  planButtons.forEach(item => { item.disabled = true; }); errorBox.hidden = true;
  try {
    const { url } = await postJson("/api/v3/billing/checkout", { currency: button.dataset.currency });
    location.assign(safeStripeUrl(url));
  } catch (error) { showError(error); planButtons.forEach(item => { item.disabled = !checkoutReady; }); }
}));
portalButton.addEventListener("click", async () => {
  portalButton.disabled = true; errorBox.hidden = true;
  try { const { url } = await postJson("/api/v3/billing/portal", {}); location.assign(safeStripeUrl(url)); }
  catch (error) { showError(error); portalButton.disabled = false; }
});
refreshButton.addEventListener("click", load);
const result = new URLSearchParams(location.search).get("checkout");
if (result) {
  const note = document.querySelector("#return-note");
  note.textContent = result === "success" ? "決済画面から戻りました。Webhookの反映後に状態を再確認してください。" : "決済を中断しました。契約は開始されていません。";
  note.hidden = false; history.replaceState(null, "", location.pathname);
}
load();
