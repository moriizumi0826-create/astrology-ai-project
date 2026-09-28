import test from "node:test";
import assert from "node:assert/strict";
import { customPlaybackDates, samplePlaybackDates } from "../src/transit-playback-range.mjs";

test("custom playback includes both endpoints across leap days and year boundaries", () => {
  assert.deepEqual(customPlaybackDates("2028-02-28", "2028-03-01"), ["2028-02-28", "2028-02-29", "2028-03-01"]);
  assert.deepEqual(customPlaybackDates("2026-12-31", "2027-01-01"), ["2026-12-31", "2027-01-01"]);
  assert.equal(customPlaybackDates("2028-01-01", "2028-12-31").length, 366);
});

test("invalid, reversed, same-day and excessive ranges fail before loading", () => {
  for (const [start, end] of [["", "2026-10-01"], ["2026-02-30", "2026-03-02"],
    ["2026-10-02", "2026-10-01"], ["2026-10-01", "2026-10-01"], ["2028-01-01", "2029-01-01"]]) {
    assert.throws(() => customPlaybackDates(start, end));
  }
});

test("restricted date views reject unavailable dates rather than shortening the requested range", () => {
  const dates = ["2026-09-01", "2026-09-02"];
  assert.deepEqual(customPlaybackDates(dates[0], dates[1], dates), dates);
  assert.throws(() => customPlaybackDates(dates[0], "2026-09-03", dates));
});

test("fast playback always lands on the requested end without duplicates", () => {
  const dates = customPlaybackDates("2026-09-01", "2026-09-06");
  assert.deepEqual(samplePlaybackDates(dates, 3), ["2026-09-01", "2026-09-04", "2026-09-06"]);
  assert.deepEqual(samplePlaybackDates(dates.slice(0, 4), 3), ["2026-09-01", "2026-09-04"]);
  assert.deepEqual(samplePlaybackDates(dates.slice(0, 2), 3), dates.slice(0, 2));
  assert.deepEqual(samplePlaybackDates(dates, 1), dates);
});
