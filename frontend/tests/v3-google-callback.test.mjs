import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../v3/auth-callback.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replace('await import("./account-birth-editor.jsx")', "({ mountBirthEditor: mockMountBirthEditor })");

async function callback({ saved = true, search = "?mode=google&code=test-code", session = { user_id: "same-existing-user" } } = {}) {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, { hidden: false, value: "", addEventListener() {} });
    return elements.get(selector);
  };
  let finishes = 0, mounted = 0, accountReads = 0, verified = 0;
  const document = { querySelector: element };
  vm.runInNewContext(source, {
    URLSearchParams, document, location: { search, hash: "", pathname: "/auth-callback.html" },
    history: { replaceState() {} },
    authClient: async () => ({ auth: { verifyOtp: async () => { verified++; return { error: null }; } } }),
    getJson: async () => { accountReads++; return session; },
    finishMemberLogin: async () => { finishes++; }, getStoredReadingForm: () => saved ? { birth_date: "existing" } : null,
    mockMountBirthEditor: async () => { mounted++; }, configureStorage() {}, authMessage: () => "認証失敗",
  });
  await new Promise(resolve => setImmediate(resolve));
  return { element, document, finishes, mounted, accountReads, verified };
}

test("Google callback restores existing profile without requiring email OTP or editing birth data", async () => {
  const result = await callback();
  assert.equal(result.verified, 0);
  assert.equal(result.finishes, 1);
  assert.equal(result.mounted, 0);
  assert.equal(result.element("#heading").textContent, "Googleログイン完了");
  assert.equal(result.element("#callback-form").hidden, false);
});
test("Google new account proceeds to existing birth-data onboarding", async () => {
  const result = await callback({ saved: false });
  assert.equal(result.mounted, 1);
  assert.equal(result.element("#heading").textContent, "出生データの登録");
});
test("Google cancel does not silently reuse a signed-in account", async () => {
  const result = await callback({ search: "?mode=google&error=access_denied" });
  assert.equal(result.accountReads, 0);
  assert.equal(result.finishes, 0);
  assert.match(result.element("#error").textContent, /キャンセル/);
});
test("Google callback without a member session shows Google-specific retry guidance", async () => {
  const result = await callback({ session: {} });
  assert.equal(result.finishes, 0);
  assert.match(result.element("#error").textContent, /Googleログインを確認できません/);
  assert.doesNotMatch(result.element("#error").textContent, /メールを再送/);
});
