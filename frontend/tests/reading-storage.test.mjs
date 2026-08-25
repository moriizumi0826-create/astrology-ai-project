import assert from "node:assert/strict";
import test from "node:test";

import { normalizeReadingRequest } from "../src/reading-storage.js";

test("normalizes the stored display form before an API refresh", () => {
  const request = normalizeReadingRequest({
    full_name: " 山田 太郎 ",
    birth_date: "1990/2/3",
    birth_time: "7:05",
    birth_time_unknown: false,
    birth_prefecture: "Tokyo",
    birthplace: "世田谷区",
    resolved_birthplace: "世田谷区, 東京都, 日本",
    latitude: "35.6466",
    longitude: "139.6532",
    timezone_offset: "9",
    timezone_name: "Asia/Tokyo",
  });

  assert.deepEqual(request, {
    full_name: "山田 太郎",
    birth_date: "1990-02-03",
    birth_time: "07:05",
    birth_time_unknown: false,
    birthplace: "世田谷区, 東京都, 日本",
    latitude: 35.6466,
    longitude: 139.6532,
    timezone_offset: 9,
    timezone_name: "Asia/Tokyo",
  });
});

test("converts an unknown stored birth time to null", () => {
  const request = normalizeReadingRequest({
    full_name: "Test User",
    birth_date: "2000-01-01",
    birth_time: "",
    birth_time_unknown: "true",
    birthplace: "札幌市, 北海道, 日本",
    latitude: "43.0618",
    longitude: "141.3545",
    timezone_offset: "9",
    timezone_name: "Asia/Tokyo",
    target_date: "2026-08-25",
  });

  assert.equal(request.birth_time, null);
  assert.equal(request.birth_time_unknown, true);
  assert.equal(request.target_date, "2026-08-25");
});

test("reports incomplete stored coordinates before sending a request", () => {
  assert.throws(() => normalizeReadingRequest({
    full_name: "Test User",
    birth_date: "2000-01-01",
    birth_time: "12:00",
    birth_time_unknown: false,
    birthplace: "東京都",
    latitude: "",
    longitude: "139.6917",
    timezone_offset: "9",
    timezone_name: "Asia/Tokyo",
  }), /緯度が保存されていません/);
});

