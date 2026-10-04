import test from "node:test";
import assert from "node:assert/strict";
import { fetchAppVersion, reloadLatestApp } from "../v3/app-version.mjs";

test("same build is current, different build is an update; bypass cached manifest", async () => {
  for (const latest of ["loaded", "new-build"]) {
    const result = await fetchAppVersion("loaded", { fetcher: async (url, options) => {
      assert.match(url, /^\/version\.json\?_check=\d+$/);
      assert.equal(options.cache, "no-store");
      return { ok: true, json: async () => ({ buildId: latest }) };
    } });
    assert.equal(result.isAppOutdated, latest !== "loaded");
  }
});
test("failed or malformed checks are not mistaken for current", async () => {
  for (const response of [{ ok: false }, { ok: true, json: async () => ({}) }, { ok: true, json: async () => ({ buildId: " " }) }]) {
    await assert.rejects(fetchAppVersion("loaded", { fetcher: async () => response }));
  }
});
test("reload retains chart route and query, adds cache-busting timestamp", () => {
  let destination;
  reloadLatestApp({ href: "https://example.com/index.html?date=2026-10-04#horoscope", replace: url => { destination = new URL(url); } }, 123);
  assert.equal(destination.hash, "#horoscope");
  assert.equal(destination.searchParams.get("date"), "2026-10-04");
  assert.equal(destination.searchParams.get("_app_refresh"), "123");
});
