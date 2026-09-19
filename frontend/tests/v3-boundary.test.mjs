import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("V3 keeps local development isolated and requires an explicit public API URL", () => {
  const config = readFileSync(new URL("../vite.v3.config.mjs", import.meta.url), "utf8");
  assert.match(config, /host: "127\.0\.0\.1"/);
  assert.match(config, /strictPort: true/);
  assert.match(config, /target: "http:\/\/127\.0\.0\.1:8103"/);
  assert.match(config, /VITE_V3_API_BASE_URL/);
  assert.match(config, /V3_INCLUDE_TEST_LOGIN/);
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
  assert.match(blueprint, /V3_STRIPE_WEBHOOK_SECRET[\s\S]*sync: false/);
  assert.doesNotMatch(blueprint, /sk_test_|sb_secret_|whsec_/);
});

test("legacy build entry points do not include the local V3 shell", () => {
  const config = readFileSync(new URL("../vite.config.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(config, /v3\/index|vite\.v3|backend\/v3/);
});
