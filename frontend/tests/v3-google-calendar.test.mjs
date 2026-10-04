import test from "node:test";
import assert from "node:assert/strict";
import { googleCalendarEventUrl } from "../v3/google-calendar.mjs";

test("offset-aware event uses UTC without shifting the event instant", () => {
  const url = new URL(googleCalendarEventUrl({ title: "火星 ☌ 金星", note: "説明 & メモ", event_datetime: "2026-10-04T09:15:00+09:00", birth_date: "PRIVATE", email: "PRIVATE" }, "Asia/Tokyo"));
  assert.equal(url.origin, "https://calendar.google.com");
  assert.equal(url.searchParams.get("dates"), "20261004T001500Z/20261004T004500Z");
  assert.equal(url.searchParams.get("text"), "火星 ☌ 金星");
  assert.match(url.searchParams.get("details"), /説明 & メモ/);
  assert.doesNotMatch(url.href, /PRIVATE/);
});
test("UTC source takes priority, including DST repeated local hours", () => {
  const url = new URL(googleCalendarEventUrl({ event_utc_datetime: "2026-11-01T06:30:00Z", event_datetime: "2026-11-01T01:30:00-04:00" }, "America/New_York"));
  assert.equal(url.searchParams.get("dates"), "20261101T063000Z/20261101T070000Z");
  assert.equal(url.searchParams.get("ctz"), "America/New_York");
});
test("legacy local time uses the explicit calendar timezone and crosses midnight", () => {
  const url = new URL(googleCalendarEventUrl({ event_datetime: "2026-10-31T23:45:00" }, "Asia/Tokyo"));
  assert.equal(url.searchParams.get("dates"), "20261031T234500/20261101T001500");
});
test("date-only events are all-day with exclusive next-day end", () => {
  const url = new URL(googleCalendarEventUrl({ event_date: "2026-12-31" }));
  assert.equal(url.searchParams.get("dates"), "20261231/20270101");
});
test("invalid dates, times and zones do not generate misleading events", () => {
  for (const event of [{ event_date: "2026-02-30" }, { event_datetime: "2026-10-04T24:15:00Z" }, { event_datetime: "bad" }, {}]) assert.throws(() => googleCalendarEventUrl(event));
  assert.throws(() => googleCalendarEventUrl({ event_date: "2026-10-04" }, "Invalid/Zone"));
});
