import assert from "node:assert/strict";
import test from "node:test";
import { buildBirthRequest, birthLocationQuery, birthSearchScope, normalizeBirthDate } from "../src/birth-input.mjs";
import { normalizeReadingRequest } from "../src/reading-storage.js";

const overseas = {
  full_name: "Test", birth_date: "1990-07-15", birth_time: "12:00",
  birth_country: "WORLD", birthplace: "New York, United States",
  latitude: "40.7128", longitude: "-74.006", timezone_name: "America/New_York",
  timezone_offset: "", birth_time_fold: null,
};

test("overseas input needs no Japanese prefecture and retains its zone", () => {
  const request = buildBirthRequest(overseas);
  assert.equal(request.birthplace, "New York, United States");
  assert.equal(request.timezone_name, "America/New_York");
  assert.equal(request.timezone_offset, null);
  assert.deepEqual(birthLocationQuery({ ...overseas, birth_prefecture: "Tokyo" }), {
    q: overseas.birthplace, prefecture: "", country_code: "WORLD",
  });
});

test("birthplace timezone is mandatory, never inferred from the device", () => {
  assert.throws(() => buildBirthRequest({ ...overseas, timezone_name: "" }), /タイムゾーン/);
  assert.throws(() => buildBirthRequest({ ...overseas, timezone_name: "Invalid/Zone" }), /タイムゾーン/);
  assert.throws(() => buildBirthRequest({ ...overseas, latitude: "" }), /緯度/);
});

test("legacy Japan and zero-valued location/offset inputs are preserved", () => {
  assert.equal(birthSearchScope({}), "JP");
  assert.equal(birthSearchScope(overseas), "WORLD");
  assert.equal(birthSearchScope({ timezone_name: "Asia/Tokyo" }), "JP");
  const request = buildBirthRequest({ ...overseas, latitude: 0, longitude: 0, timezone_name: null, timezone_offset: 0 });
  assert.equal(request.latitude, 0);
  assert.equal(request.longitude, 0);
  assert.equal(request.timezone_offset, 0);
  assert.throws(() => birthLocationQuery({ birthplace: "Tokyo", birth_country: "JP" }), /都道府県/);
});

test("fold selection survives storage normalization for API refresh/playback", () => {
  const request = buildBirthRequest({ ...overseas, birth_time_fold: "1" });
  assert.equal(request.birth_time_fold, 1);
  assert.equal(normalizeReadingRequest(request).birth_time_fold, 1);
  assert.equal(buildBirthRequest({ ...overseas, birth_time_fold: "0" }).birth_time_fold, 0);
  assert.throws(() => buildBirthRequest({ ...overseas, birth_time_fold: "2" }), /重複/);
});

test("calendar validation is independent of device midnight transitions", () => {
  assert.equal(normalizeBirthDate("2011-12-30"), "2011-12-30");
  assert.equal(normalizeBirthDate("2000-02-29"), "2000-02-29");
  assert.equal(normalizeBirthDate("2001-02-29"), "");
  assert.equal(buildBirthRequest({ ...overseas, birth_time_unknown: true, birth_time: "" }).birth_time, null);
});
