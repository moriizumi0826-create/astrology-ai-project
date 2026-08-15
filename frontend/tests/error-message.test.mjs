import assert from "node:assert/strict";
import test from "node:test";

import { readableErrorMessage } from "../src/error-message.mjs";


const GUIDANCE = "通信に失敗しました。接続を確認して、このページでもう一度お試しください。";

test("replaces fetch network errors with page-local retry guidance", () => {
  assert.equal(readableErrorMessage(new TypeError("Failed to fetch"), "fallback"), GUIDANCE);
  assert.equal(readableErrorMessage(new Error("Network request failed"), "fallback"), GUIDANCE);
  assert.equal(readableErrorMessage(new Error("API通信に失敗しました。"), "fallback"), GUIDANCE);
});

test("preserves specific server errors and fallbacks", () => {
  assert.equal(readableErrorMessage(new Error("HTTP 500: detail"), "fallback"), "HTTP 500: detail");
  assert.equal(readableErrorMessage(null, "fallback"), "fallback");
});
