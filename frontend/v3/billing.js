import { getJson, postJson } from "./api.mjs";
import { initializeAuth } from "./auth-client.mjs";

const state = document.querySelector("#state");
const errorBox = document.querySelector("#error");
const planButtons = [...document.querySelectorAll("[data-currency]")];
const portalButton = document.querySelector("#portal");
const refreshButton = document.querySelector("#refresh");

function safeStripeUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".stripe.com")) throw new Error("Stripeの遷移先を確認できません。");
  return url.href;
}
function showError(error) { errorBox.textContent = error.message; errorBox.hidden = false; }
function describe(subscription) {
  if (!subscription) return "現在は無料会員です。";
  const until = subscription.access_until ? new Date(subscription.access_until).toLocaleString() : "確認中";
  const currency = subscription.currency === "jpy" ? "400円" : "US$4.50";
  const cancel = subscription.cancel_at_period_end ? "（期間終了時に解約）" : "";
  return `契約状態：${subscription.status}／月額 ${currency}／利用期限 ${until}${cancel}`;
}
async function load() {
  errorBox.hidden = true; refreshButton.disabled = true;
  try {
    await initializeAuth();
    const session = await getJson("/api/v3/session");
    if (!session.user_id) { location.replace("/login.html"); return; }
    const billing = await getJson("/api/v3/billing/status");
    state.textContent = billing.configured ? describe(billing.subscription) : "Stripeテスト決済の接続設定が必要です。";
    planButtons.forEach(button => { button.disabled = !billing.configured || session.state === "paid"; });
    portalButton.hidden = !billing.customer;
  } catch (error) { showError(error); }
  finally { refreshButton.disabled = false; }
}
planButtons.forEach(button => button.addEventListener("click", async () => {
  planButtons.forEach(item => { item.disabled = true; }); errorBox.hidden = true;
  try {
    const { url } = await postJson("/api/v3/billing/checkout", { currency: button.dataset.currency });
    location.assign(safeStripeUrl(url));
  } catch (error) { showError(error); planButtons.forEach(item => { item.disabled = false; }); }
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
  note.textContent = result === "success" ? "決済画面から戻りました。Webhookの反映後に状態を再確認してください。" : "テスト決済を中断しました。契約は開始されていません。";
  note.hidden = false; history.replaceState(null, "", location.pathname);
}
load();
