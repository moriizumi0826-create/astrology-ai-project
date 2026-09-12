import test from "node:test";
import assert from "node:assert/strict";
import { preloadTransitCharts } from "../src/transit-chart-preload.mjs";
import { normalizeReadingRequest } from "../src/reading-storage.js";

const key = (date, time) => `${date}T${time}`;
const chart = (date, time = "12:00") => ({ date, time, transits: [], house_cusps: [] });
const dates = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
function setup(extra = {}) {
  const calls = [], progress = [], cache = new Map();
  const options = { dates, targetTime: "12:00", cache, cacheKey: key, formPayload: { latitude: 35 }, onProgress: (...args) => progress.push(args),
    request: async (path, payload) => { calls.push([path, payload]); return { charts: payload.target_dates.map((date) => chart(date, payload.target_time)) }; }, ...extra };
  return { options, calls, progress, cache };
}

test("30 dates use one request only when invoked; repeated playback uses cache", async () => {
  const s = setup();
  assert.equal(s.calls.length, 0);
  await preloadTransitCharts(s.options);
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0][0], "/api/transit-charts");
  assert.deepEqual(s.calls[0][1].target_dates, dates);
  assert.deepEqual(s.progress.at(-1), [30, 30]);
  await preloadTransitCharts(s.options);
  assert.equal(s.calls.length, 1);
});
test("cached dates omitted, other selected times are separate", async () => {
  const s = setup();
  s.cache.set(key(dates[0], "12:00"), chart(dates[0]));
  await preloadTransitCharts(s.options);
  assert.equal(s.calls[0][1].target_dates.length, 29);
  await preloadTransitCharts({ ...s.options, targetTime: "12:10" });
  assert.equal(s.calls[1][1].target_dates.length, 30);
});
test("older API uses existing four-parallel fallback", async () => {
  let batchCalls = 0, singleCalls = 0, inFlight = 0, peak = 0;
  const s = setup({ request: async (path, payload) => {
    if (path === "/api/transit-charts") { batchCalls++; throw Object.assign(new Error("Not found"), { status: 404 }); }
    singleCalls++; peak = Math.max(peak, ++inFlight);
    await new Promise((resolve) => setTimeout(resolve, 1));
    inFlight--; return chart(payload.target_date);
  } });
  await preloadTransitCharts(s.options);
  assert.equal(batchCalls, 1); assert.equal(singleCalls, 30); assert.equal(peak, 4);
  assert.deepEqual(s.progress.at(-1), [30, 30]);
});
test("server errors do not trigger a burst of fallback requests", async () => {
  let calls = 0;
  const s = setup({ request: async () => { calls++; throw Object.assign(new Error("busy"), { status: 503 }); } });
  await assert.rejects(preloadTransitCharts(s.options), /busy/);
  assert.equal(calls, 1); assert.equal(s.cache.size, 0);
  assert.notDeepEqual(s.progress.at(-1), [30, 30]);
});
test("malformed or partial batches never populate cache or complete progress", async () => {
  for (const response of [{ charts: [] }, { charts: dates.map((date) => chart(date, "12:10")) }, {}]) {
    const s = setup({ request: async () => response });
    await assert.rejects(preloadTransitCharts(s.options));
    assert.equal(s.cache.size, 0);
  }
});
test("long paid ranges split within API limit", async () => {
  const allDates = Array.from({ length: 400 }, (_, i) => new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10));
  const s = setup({ dates: allDates });
  await preloadTransitCharts(s.options);
  assert.deepEqual(s.calls.map((call) => call[1].target_dates.length), [366, 34]);
  assert.deepEqual(s.progress.at(-1), [400, 400]);
});
test("normalization retains new batch fields", () => {
  const value = normalizeReadingRequest({ full_name: "Test", birthplace: "Tokyo", birth_date: "1990-01-01", birth_time: "12:00", latitude: 35, longitude: 139, timezone_offset: 9, target_dates: dates, target_time: "12:10" });
  assert.deepEqual(value.target_dates, dates);
  assert.equal(value.target_time, "12:10");
});
