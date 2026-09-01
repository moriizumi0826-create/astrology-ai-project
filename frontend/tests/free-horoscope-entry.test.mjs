import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildFreePlaybackDates,
  FREE_PLAYBACK_DAYS_AFTER_TODAY,
  FREE_PLAYBACK_DAYS_BEFORE_TODAY,
  FREE_PLAYBACK_WINDOW_DAYS,
} from "../src/free-playback-window.mjs";

const frontendRoot = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, frontendRoot), "utf8");
}

test("V2 uses a dedicated free Horoscope entry", async () => {
  const html = await source("forecast-detail-v2.html");
  assert.match(html, /src\/forecast-detail-free\.jsx/);
  assert.doesNotMatch(html, /src\/forecast-detail\.jsx/);
});

test("free Horoscope source does not import or request paid forecast content", async () => {
  const freeEntry = await source("src/forecast-detail-free.jsx");
  const freeContent = await source("src/free-horoscope-content.jsx");
  const freeMap = await source("src/horoscope-3d-map.jsx");
  const combined = `${freeEntry}\n${freeContent}\n${freeMap}`;

  assert.doesNotMatch(combined, /dashboard-shared/);
  assert.doesNotMatch(combined, /monthly-overview/);
  assert.doesNotMatch(combined, /\/api\/yearly-forecast/);
  assert.doesNotMatch(combined, /\/api\/readings\/deferred/);
  assert.doesNotMatch(combined, /UnifiedForecastView/);
  assert.match(freeEntry, /星の見通し/);
  assert.match(freeEntry, /LockKeyhole/);
});

test("V2 playback dates stay fixed to today plus or minus 15 days", () => {
  const dates = buildFreePlaybackDates("2026-09-01");

  assert.equal(FREE_PLAYBACK_DAYS_BEFORE_TODAY, 15);
  assert.equal(FREE_PLAYBACK_DAYS_AFTER_TODAY, 15);
  assert.equal(FREE_PLAYBACK_WINDOW_DAYS, 31);
  assert.equal(dates.length, 31);
  assert.equal(dates[0], "2026-08-17");
  assert.equal(dates[15], "2026-09-01");
  assert.equal(dates[30], "2026-09-16");
});

test("V2 playback window handles month and leap-year boundaries", () => {
  const dates = buildFreePlaybackDates("2028-03-01");

  assert.equal(dates[0], "2028-02-15");
  assert.equal(dates[14], "2028-02-29");
  assert.equal(dates[30], "2028-03-16");
  assert.deepEqual(buildFreePlaybackDates("2026-02-30"), []);
});
