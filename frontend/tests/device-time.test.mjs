import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { localDate, withDeviceTimezone, deviceTimezone } from "../src/device-time.mjs";
import { isStoredResultFresh, normalizeReadingRequest } from "../src/reading-storage.js";

test("local day can differ from Japan at the same UTC instant", () => {
  const instant = new Date("2026-09-12T01:00:00Z");
  assert.equal(localDate(instant, "Asia/Tokyo"), "2026-09-12");
  assert.equal(localDate(instant, "America/Los_Angeles"), "2026-09-11");
  assert.equal(localDate(new Date("2026-12-31T12:00:00Z"), "Pacific/Auckland"), "2027-01-01");
});
test("display timezone never overwrites historical birth timezone or offset", () => {
  const birth = {full_name:"QA", birth_date:"1990-07-15", birth_time:"12:00", birthplace:"Tokyo",
    latitude:35.68, longitude:139.76, timezone_name:"Asia/Tokyo", timezone_offset:9,
    display_timezone_name:"Pacific/Honolulu"};
  for (const result of [normalizeReadingRequest(birth), withDeviceTimezone(birth)]) {
    assert.equal(result.timezone_name, "Asia/Tokyo");
    assert.equal(result.timezone_offset, 9);
    assert.equal(result.display_timezone_name, deviceTimezone());
  }
  assert.equal(birth.display_timezone_name, "Pacific/Honolulu");
});
test("legacy results and results from another device timezone need refresh", () => {
  assert.equal(isStoredResultFresh({reading_date:localDate()}), false);
  assert.equal(isStoredResultFresh({reading_date:localDate(), meta:{display_timezone_name:"Not/AZone"}}), false);
  assert.equal(isStoredResultFresh({reading_date:localDate(), meta:{display_timezone_name:deviceTimezone()}}), true);
  assert.equal(isStoredResultFresh({reading_date:"2000-01-01", meta:{display_timezone_name:deviceTimezone()}}), false);
});
test("device timezone is resolved at call time in different runtime regions", () => {
  const moduleUrl = new URL("../src/device-time.mjs", import.meta.url).href;
  for (const zone of ["Asia/Tokyo","America/Los_Angeles","Europe/Paris"]) {
    const code = `import {deviceTimezone, localDate} from ${JSON.stringify(moduleUrl)};
      console.log(JSON.stringify([deviceTimezone(),localDate(new Date("2026-09-12T01:00:00Z"))]));`;
    const output = JSON.parse(execFileSync(process.execPath, ["--input-type=module","-e",code], {
      env:{...process.env,TZ:zone}, encoding:"utf8"
    }));
    assert.equal(output[0], zone);
    assert.equal(output[1], zone === "America/Los_Angeles" ? "2026-09-11" : "2026-09-12");
  }
});
