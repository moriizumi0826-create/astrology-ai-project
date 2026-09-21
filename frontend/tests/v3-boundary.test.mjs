import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V3 keeps local development isolated and requires an explicit public API URL", () => {
  const config = readFileSync(new URL("../vite.v3.config.mjs", import.meta.url), "utf8");
  assert.match(config, /host: "127\.0\.0\.1"/);
  assert.match(config, /strictPort: true/);
  assert.match(config, /target: "http:\/\/127\.0\.0\.1:8103"/);
  assert.match(config, /VITE_V3_API_BASE_URL/);
  assert.match(config, /VITE_V3_ENVIRONMENT/);
  assert.match(config, /V3_INCLUDE_TEST_LOGIN/);
  assert.match(config, /deployment === "local"/);
  const entry = readFileSync(new URL("../v3/api.mjs", import.meta.url), "utf8");
  assert.match(entry, /apiPath/);
  assert.match(entry, /apiUrl/);
  assert.doesNotMatch(entry, /onrender\.com|localStorage|VITE_API_BASE_URL/);
});

test("public V3 deployment is separate from the legacy Render service", () => {
  const blueprint = readFileSync(new URL("../../render-v3.yaml", import.meta.url), "utf8");
  assert.match(blueprint, /celestial-atelier-v3-api/);
  assert.match(blueprint, /celestial-atelier-v3-preview/);
  assert.match(blueprint, /V3_ENVIRONMENT[\s\S]*preview/);
  assert.match(blueprint, /V3_BILLING_ENABLED[\s\S]*true/);
  assert.match(blueprint, /V3_STRIPE_WEBHOOK_SECRET[\s\S]*sync: false/);
  assert.doesNotMatch(blueprint, /sk_test_|sb_secret_|whsec_/);
});

test("production V3 blueprint starts with billing closed and contains no secrets", () => {
  const blueprint = readFileSync(new URL("../../render-v3-production.yaml", import.meta.url), "utf8");
  assert.match(blueprint, /celestial-atelier-v3-production-api/);
  assert.match(blueprint, /V3_ENVIRONMENT[\s\S]*production/);
  assert.match(blueprint, /V3_BILLING_ENABLED\s*\n\s*value: false/);
  assert.match(blueprint, /V3_SUPABASE_PROJECT_REF[\s\S]*sync: false/);
  assert.match(blueprint, /VITE_V3_ENVIRONMENT[\s\S]*production/);
  assert.doesNotMatch(blueprint, /sk_(?:test|live)_|sb_secret_|whsec_/);
});

test("production-facing source does not hard-code preview billing copy", () => {
  const billing = readFileSync(new URL("../v3/billing.html", import.meta.url), "utf8");
  const entry = readFileSync(new URL("../v3/entry.html", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../v3/index.html", import.meta.url), "utf8");
  assert.doesNotMatch(billing, /テスト決済|テストモード/);
  assert.doesNotMatch(entry, /テスト運用版|Test Operation/);
  assert.doesNotMatch(workspace, /V3 検証/);
});

test("legacy build entry points do not include the local V3 shell", () => {
  const config = readFileSync(new URL("../vite.config.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(config, /v3\/index|vite\.v3|backend\/v3/);
});
