import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { configureStorage, storeReadingResult, getStoredReadingResult, storeReadingForm, getStoredReadingForm } from "../v3/reading-storage.js";
import { apiPath } from "../v3/api.mjs";
import { birthProfile } from "../v3/profile.mjs";

test("V3 endpoints never use a query-provided external server", () => {
  assert.equal(apiPath("/api/transit-chart"), "/api/v3/transit-chart");
  assert.equal(apiPath("/api/v2/aspect-interpretations"), "/api/v3/aspect-interpretations");
  assert.throws(() => apiPath("https://example.test/api/readings"));
  assert.throws(() => apiPath("/api/../readings"));
});
test("one map implementation is shared and paid entry is lazy", () => {
  const paid = readFileSync(new URL("../v3/paid-forecast.jsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../v3/app.jsx", import.meta.url), "utf8");
  assert.match(paid, /from "\.\/horoscope-map\.jsx"/);
  assert.doesNotMatch(paid, /function TransitNatalSunMap/);
  assert.match(app, /lazy\(\(\) => import\("\.\/paid-forecast\.jsx"\)\)/);
  assert.match(app, /DeviceTimeBoundary key=\{`\$\{session.user_id\}:\$\{session.state\}`\}/);
  assert.match(app, /const navigate = next => \{ setPaidReady\(false\)/);
  const map = readFileSync(new URL("../v3/horoscope-map.jsx", import.meta.url), "utf8");
  assert.match(map, /isFreePlayback \? buildFreePlaybackDates\(currentLocalDate\(\)\)/);
  assert.match(map, /buildTransitPlaybackDates\(playbackStartDate, rangeOption.days\)/);
  assert.doesNotMatch(map, /setAspectInterpretationScope\(nextMode === "natalNatal" \? "all"/);
});
test("V3 storage isolates owners and never persists paid dashboard or yearly results", async t => {
  const values = new Map([["celestial-atelier:last-reading-form", "legacy untouched"]]);
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } };
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  configureStorage({ user_id: "A", state: "paid" });
  storeReadingForm({ birth_date: "1984-08-26" });
  await storeReadingResult({ meta: {}, readings: [], dashboard_data: { natal_points: [], reading_date: "2026-09-14", private_paid_text: "secret" }, yearly_forecast: { secret: true } });
  assert.ok(getStoredReadingResult({ allowStale: true }).yearly_forecast);
  assert.ok(![...values.values()].some(value => value.includes("secret")));
  configureStorage({ user_id: "A", state: "free" });
  assert.equal(getStoredReadingResult({ allowStale: true }).yearly_forecast, undefined);
  assert.equal(getStoredReadingForm().birth_date, "1984-08-26");
  configureStorage({ user_id: "B", state: "paid" });
  assert.equal(getStoredReadingForm(), null);
  assert.equal(getStoredReadingResult({ allowStale: true }), null);
  assert.equal(values.get("celestial-atelier:last-reading-form"), "legacy untouched");
});
test("real member birth data stays memory-only and profile excludes display state", async t => {
  const values = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } };
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  configureStorage({ user_id: "supabase:project:member", state: "free" });
  const input = { full_name: "Member", birth_date: "1984-08-26", birth_time: "19:20", birthplace: "Tokyo",
    latitude: 35.68, longitude: 139.76, timezone_name: "Asia/Tokyo", display_timezone_name: "America/New_York", target_date: "2026-09-19" };
  storeReadingForm(input);
  await storeReadingResult({ meta: {}, dashboard_data: {} });
  assert.deepEqual(getStoredReadingForm(), input);
  assert.equal(values.size, 0);
  assert.equal(birthProfile(input).timezone_name, "Asia/Tokyo");
  assert.equal(birthProfile(input).display_timezone_name, undefined);
  assert.equal(birthProfile(input).target_date, undefined);
});
