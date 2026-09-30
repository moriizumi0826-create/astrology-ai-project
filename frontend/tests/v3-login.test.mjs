import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const script = fs.readFileSync(new URL("../v3/login.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "");
const html = fs.readFileSync(new URL("../v3/login.html", import.meta.url), "utf8");
async function setup({ member = false, failInit = false, now = "2026-09-30T12:00:00+09:00" } = {}) {
  const elements = new Map();
  const el = selector => {
    if (!elements.has(selector)) elements.set(selector, { value: "", hidden: false, dataset: {}, attrs: {}, handlers: {},
      setAttribute(k,v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, addEventListener(k,v) { this.handlers[k] = v; }, focus() {}, append() {} });
    return elements.get(selector);
  };
  for (const id of html.matchAll(/id="([^"]+)"/g)) el(`#${id[1]}`);
  const modes = ["login", "signup", "reset"].map(mode => Object.assign(el(`mode-${mode}`), { dataset: { mode } }));
  let failure = null, calls = [], resolveInit;
  const initial = new Promise(resolve => { resolveInit = resolve; });
  const auth = Object.fromEntries(["signInWithPassword", "signUp", "resetPasswordForEmail", "resend", "signOut"].map(name => [name, async args => { calls.push({ name, args }); return { error: failure }; }]));
  auth.getUser = async () => ({ data: { user: { email: "test@example.com" } } });
  const context = vm.createContext({ Date: { now: () => Date.parse(now), parse: Date.parse }, document: { querySelector: el, querySelectorAll: selector => selector.includes("[data-mode]") ? modes : [...elements.values()] },
    initializeAuth: async () => { await initial; if (failInit) throw Error("offline"); return { mode: "supabase" }; }, authClient: async () => ({ auth }),
    getJson: async () => member ? { user_id: "test" } : {}, configureStorage() {}, getStoredReadingForm: () => ({ test: true }),
    finishMemberLogin: async () => {}, initializeCaptcha: async () => {}, resetCaptcha() {}, captchaTokenForRequest: () => "captcha-test",
    authMessage: () => "入力・通信状態を確認してください。", __APP_ENVIRONMENT__: "local", location: { origin: "http://localhost", assign(url) { calls.push({ name: "navigate", url }); }, replace() {}, reload() {} } });
  vm.runInContext(script, context);
  assert.equal(el("#submit").disabled, true);
  resolveInit(); await new Promise(resolve => setImmediate(resolve));
  return { el, calls, mode: next => vm.runInContext(`setMode('${next}')`, context), fail: value => { failure = value; },
    submit: () => el("#member-form").handlers.submit({ preventDefault() {} }) };
}
test("login starts hidden until session check; separate auth stylesheet", () => {
  assert.match(html, /id="auth-content" hidden/);
  assert.match(html, /href="\/auth.css"/);
  assert.doesNotMatch(html, /登録だけで有料機能/);
});
test("modes expose password guidance and preserve password after failed login", async () => {
  const ui = await setup();
  ui.mode("signup"); assert.equal(ui.el("#password").minLength, 12); assert.equal(ui.el("#signup-note").hidden, false);
  ui.mode("login"); ui.el("#password").value = "example-password"; ui.fail({ code: "invalid_credentials" });
  await ui.submit(); assert.equal(ui.el("#password").value, "example-password"); assert.equal(ui.el("#submit").disabled, false);
  ui.el("#show-password").handlers.click(); assert.equal(ui.el("#password").type, "text");
});
test("signup confirmation, resend and edit preserve original recipient and captcha", async () => {
  const ui = await setup(); ui.mode("signup"); ui.el("#email").value = "test@example.com"; ui.el("#password").value = "example-password";
  await ui.submit(); assert.equal(ui.el("#fields").hidden, true); assert.equal(ui.el("#sent-email").textContent, "test@example.com");
  assert.equal(ui.el("#password").value, "");
  await ui.el("#resend").handlers.click(); assert.equal(ui.calls.at(-1).name, "resend"); assert.equal(ui.calls.at(-1).args.options.captchaToken, "captcha-test");
  ui.el("#edit-email").handlers.click(); assert.equal(ui.el("#fields").hidden, false); assert.equal(ui.el("#email-sent").hidden, true);
});
test("password reset resend uses reset API, not signup API", async () => {
  const ui = await setup(); ui.mode("reset"); ui.el("#email").value = "test@example.com";
  assert.equal(ui.el("#password").required, false); await ui.submit(); await ui.el("#resend").handlers.click();
  assert.deepEqual(ui.calls.map(x => x.name), ["resetPasswordForEmail", "resetPasswordForEmail"]);
});
test("signed-in account and initialization errors have explicit states", async () => {
  const member = await setup({ member: true }); assert.equal(member.el("#account-email").textContent, "test@example.com");
  const failed = await setup({ failInit: true }); assert.equal(failed.el("#retry").hidden, false); assert.equal(failed.el("#submit").disabled, true);
});
test("successful login keeps controls locked until navigation", async () => {
  const ui = await setup(); await ui.submit(); assert.equal(ui.calls.at(-1).name, "navigate"); assert.equal(ui.el("#submit").disabled, true);
});
test("campaign notice is signup-only and ends at November 1 JST", async () => {
  const ui = await setup({ now: "2026-10-31T23:59:59+09:00" });
  assert.equal(ui.el("#signup-campaign").hidden, true);
  ui.mode("signup"); assert.equal(ui.el("#signup-campaign").hidden, false);
  ui.mode("reset"); assert.equal(ui.el("#signup-campaign").hidden, true);
  const ended = await setup({ now: "2026-11-01T00:00:00+09:00" });
  ended.mode("signup"); assert.equal(ended.el("#signup-campaign").hidden, true);
  assert.doesNotMatch(html, /先着25名/); assert.match(html, /メール認証/); assert.match(html, /一定の人数に達し次第終了/);
});
