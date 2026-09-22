import test from "node:test";
import assert from "node:assert/strict";
import { billingMessage, canShowCheckoutPlan, canStartCheckout } from "../v3/billing-state.mjs";

const base = {configured: true, checkout_enabled: true, checkout_available: false};

test("billing states explain access and recovery in Japanese", () => {
  const cases = [
    ["payment_required", /支払いを確認できない.*一時停止.*支払い方法/],
    ["paused", /一時停止中.*利用できません/],
    ["processing", /確認中.*再確認/],
    ["expired", /利用期間が終了.*無料版/],
    ["canceled", /契約は終了.*無料版/],
    ["unknown", /確認できない.*停止/],
  ];
  for (const [access_state, expected] of cases) {
    assert.match(billingMessage({...base, access_state, subscription: {status: access_state}}), expected);
  }
});

test("active and canceling states show the verified access deadline", () => {
  const subscription = {status: "active", currency: "jpy", access_until: "2026-10-22T00:00:00Z"};
  assert.match(billingMessage({...base, access_state: "active", subscription}), /月額400円.*利用期限/);
  assert.match(billingMessage({...base, access_state: "active_canceling", subscription}), /解約予約済み.*有料機能/);
});

test("only no-contract or terminal-contract users see a new checkout plan", () => {
  assert.equal(canShowCheckoutPlan({...base, subscription: null}), true);
  assert.equal(canShowCheckoutPlan({...base, subscription: {status: "canceled"}}), true);
  assert.equal(canShowCheckoutPlan({...base, subscription: {status: "incomplete_expired"}}), true);
  for (const status of ["active", "past_due", "unpaid", "paused", "incomplete", "unexpected"]) {
    assert.equal(canShowCheckoutPlan({...base, subscription: {status}}), false);
  }
  assert.equal(canStartCheckout({...base, checkout_available: true}), true);
  assert.equal(canStartCheckout({...base, checkout_enabled: false, checkout_available: true}), false);
});
