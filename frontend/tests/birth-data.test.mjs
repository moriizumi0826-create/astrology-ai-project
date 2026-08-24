import assert from "node:assert/strict";
import test from "node:test";

import {
  birthFormSnapshot,
  buildReadingRequest,
  initialBirthData,
  normalizeBirthDate,
  normalizeBirthTime,
} from "../src/birth-data.mjs";

test("normalizes valid birth date and time values", () => {
  assert.equal(normalizeBirthDate("1990/2/3"), "1990-02-03");
  assert.equal(normalizeBirthDate("1990-02-30"), "");
  assert.equal(normalizeBirthTime("7:05"), "07:05");
  assert.equal(normalizeBirthTime("24:00"), "");
});

test("builds the API request from a resolved birthplace", () => {
  const request = buildReadingRequest({
    full_name: " 山田 太郎 ",
    birth_date: "1990-02-03",
    birth_time: "07:05",
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

test("allows an unknown birth time and stores an empty display time", () => {
  const form = initialBirthData({
    full_name: "Test User",
    birth_date: "2000-01-01",
    birth_time: "12:00",
    birth_time_unknown: true,
    birthplace: "札幌市",
    resolved_birthplace: "札幌市, 北海道, 日本",
    latitude: "43.0618",
    longitude: "141.3545",
    timezone_offset: "9",
    timezone_name: "Asia/Tokyo",
  });

  assert.equal(form.birth_time, "");
  assert.equal(buildReadingRequest(form).birth_time, null);
  assert.equal(birthFormSnapshot(form).birth_time, "");
});

test("rejects a changed birthplace until coordinates are resolved", () => {
  assert.throws(() => buildReadingRequest({
    full_name: "Test User",
    birth_date: "2000-01-01",
    birth_time: "12:00",
    birth_time_unknown: false,
    birth_prefecture: "Tokyo",
    birthplace: "新宿区",
    latitude: "",
    longitude: "",
    timezone_offset: "9",
    timezone_name: "Asia/Tokyo",
  }), /緯度/);
});
