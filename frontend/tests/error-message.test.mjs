import assert from "node:assert/strict";
import test from "node:test";

import { readableErrorMessage } from "../src/error-message.mjs";


const GUIDANCE = "通信に失敗しました。前のページに戻り、出生データを読み込み直して再計算してください。";

test("replaces fetch network errors with recalculation guidance", () => {
  assert.equal(readableErrorMessage(new TypeError("Failed to fetch"), "fallback"), GUIDANCE);
  assert.equal(readableErrorMessage(new Error("Network request failed"), "fallback"), GUIDANCE);
  assert.equal(readableErrorMessage(new Error("API通信に失敗しました。"), "fallback"), GUIDANCE);
});

test("preserves specific server errors and fallbacks", () => {
  assert.equal(readableErrorMessage(new Error("HTTP 500: detail"), "fallback"), "HTTP 500: detail");
  assert.equal(readableErrorMessage(null, "fallback"), "fallback");
});
