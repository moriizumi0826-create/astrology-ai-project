import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readV3 = path => readFileSync(new URL(`../v3/${path}`, import.meta.url), "utf8");
const legalFiles = ["terms.html", "privacy.html", "commerce.html", "disclaimer.html", "contact.html"];

test("LP and member pages expose every required legal route", () => {
  for (const page of ["entry.html", "login.html", "billing.html", "account.html"]) {
    const source = readV3(page);
    for (const legal of legalFiles) {
      assert.match(source, new RegExp(`/legal/${legal.replace(".", "\\.")}`), `${page} -> ${legal}`);
    }
  }
});

test("legal pages identify the operator and contain no publication placeholders", () => {
  for (const file of legalFiles) {
    const source = readV3(`public/legal/${file}`);
    assert.match(source, /The Celestial Atelier/);
    assert.doesNotMatch(source, /TODO|TBD|公開準備中|Ateliel/);
  }
  const commerce = readV3("public/legal/commerce.html");
  assert.match(commerce, /森泉勇耶/);
  assert.match(commerce, /moriizumi0826@gmail\.com/);
  assert.match(commerce, /請求があった場合、遅滞なく開示/);
  assert.match(commerce, /月額400円（税込）/);
});

test("checkout disclosure states renewal, cancellation and refund terms before payment", () => {
  const billing = readV3("billing.html");
  assert.match(billing, /毎月自動更新/);
  assert.match(billing, /いつでも解約/);
  assert.match(billing, /利用期間終了までは有料機能/);
  assert.match(billing, /返金・日割り精算は行いません/);
  assert.ok(billing.indexOf("毎月自動更新") < billing.indexOf("data-currency=\"jpy\""));
});
