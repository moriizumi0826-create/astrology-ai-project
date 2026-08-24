import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
