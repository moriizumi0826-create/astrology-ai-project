import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../v3/account.html", import.meta.url), "utf8");
const script = fs.readFileSync(new URL("../v3/account.js", import.meta.url), "utf8");
const controls = fs.readFileSync(new URL("../v3/account-controls.jsx", import.meta.url), "utf8");

test("account management separates birth-profile deletion from account deletion", () => {
  assert.match(html, /id="delete-profile"/);
  assert.match(html, /id="delete-account"/);
  assert.match(html, /現在のパスワード/);
  assert.match(html, /アカウントを削除/);
  assert.match(script, /deleteMemberProfile\(\)/);
  assert.match(script, /signInWithPassword/);
  assert.match(script, /deleteJson\("\/api\/v3\/account"/);
});

test("account deletion is blocked in the UI while a subscription needs attention", () => {
  assert.match(script, /past_due/);
  assert.match(script, /blockedBySubscription/);
  assert.match(script, /契約管理画面/);
  assert.match(controls, /href="\/account\.html"/);
});
