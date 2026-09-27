import assert from "node:assert/strict";
import test from "node:test";

import { searchBirthLocations } from "../v3/api.mjs";

test("V3 location search posts only search fields without a query string", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/v3/location-search");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(options.body), {
      q: "Paris", country_code: "FR",
    });
    return {
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ results: [] }),
    };
  };

  assert.deepEqual(await searchBirthLocations({
    q: "Paris", country_code: "FR", birth_date: "2000-01-01", birth_time: "12:34",
  }), { results: [] });
});
