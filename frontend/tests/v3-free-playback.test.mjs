import test from "node:test";
import assert from "node:assert/strict";
import { buildFreePlaybackDates } from "../v3/free-playback-window.mjs";
import { customPlaybackDates } from "../src/transit-playback-range.mjs";

test("free playback includes both 30-day boundaries across years and leap days", () => {
  for (const [today, first, last] of [["2026-01-01", "2025-12-02", "2026-01-31"], ["2024-03-01", "2024-01-31", "2024-03-31"]]) {
    const dates = buildFreePlaybackDates(today);
    assert.equal(dates.length, 61);
    assert.equal(dates[0], first);
    assert.equal(dates.at(-1), last);
    assert.deepEqual(customPlaybackDates(first, last, dates), dates);
  }
});

test("free custom playback accepts a subset and rejects either outside boundary", () => {
  const dates = buildFreePlaybackDates("2026-09-29");
  assert.deepEqual(customPlaybackDates("2026-09-29", "2026-09-30", dates), ["2026-09-29", "2026-09-30"]);
  assert.throws(() => customPlaybackDates("2026-08-29", "2026-09-01", dates));
  assert.throws(() => customPlaybackDates("2026-10-28", "2026-10-30", dates));
});
