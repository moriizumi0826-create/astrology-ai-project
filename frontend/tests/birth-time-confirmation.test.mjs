import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { birthTimeKey, isAmbiguousBirthTimeError } from "../src/birth-input.mjs";

test("only the actual ambiguous-birth error opens confirmation, including the existing API message", () => {
  assert.equal(isAmbiguousBirthTimeError(new Error("この出生時刻は時計変更により2回存在します。")), true);
  assert.equal(isAmbiguousBirthTimeError(new Error("この出生時刻は、時計を戻す日にあたるため2回存在します。")), true);
  assert.equal(isAmbiguousBirthTimeError(new Error("この出生時刻は存在しません。")), false);
  assert.equal(isAmbiguousBirthTimeError(new Error("Failed to fetch")), false);
});
test("confirmation is scoped to the checked birth time, not the selected answer or name", () => {
  const form = {birth_date:"2025-11-02", birth_time:"01:30", timezone_name:"America/New_York",
    birth_time_unknown:false, birth_country:"WORLD", birthplace:"New York"};
  assert.equal(birthTimeKey(form), birthTimeKey({...form, full_name:"Changed",birth_time_fold:1}));
  for (const changes of [{birth_date:"2025-11-03"},{birth_time:"03:30"},{birth_time_unknown:true},
    {timezone_name:"Asia/Tokyo"},{birthplace:"Tokyo"}]) {
    assert.notEqual(birthTimeKey(form),birthTimeKey({...form,...changes}));
  }
});
test("entry pages hide confirmation initially and omit the removed explanatory copy", () => {
  for (const filename of ["index.html","index-v2.html"]) {
    const html=readFileSync(new URL("../"+filename,import.meta.url),"utf8");
    if (!html.includes('id="reading-form"')) continue; // V2 legacy redirect
    assert.match(html, /id="birth-time-confirmation" hidden/);
    assert.doesNotMatch(html, /出生した日付に合わせて、夏時間を含む時差を計算します|時計変更で時刻が重複する場合|同じ現地時刻が2回存在する日のみ指定/);
    assert.doesNotMatch(html.match(/<select id="birth-time-fold"[^>]*>/)[0], /required/);
  }
});
