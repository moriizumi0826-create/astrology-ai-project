import test from "node:test";
import assert from "node:assert/strict";
import { signInWithGoogle, googleLoginError, requireGoogleProvider } from "../v3/google-login.mjs";

test("Google login uses the current origin callback and does not request Calendar permission", async () => {
  let request;
  await signInWithGoogle({ auth: { signInWithOAuth: async input => { request = input; return { error: null }; } } }, "https://thecelestialatelier.com");
  assert.equal(request.provider, "google");
  assert.equal(request.options.redirectTo, "https://thecelestialatelier.com/auth-callback.html?mode=google");
  assert.equal(request.options.queryParams.prompt, "select_account");
  assert.equal(request.options.scopes, undefined);
});
test("provider configuration errors are explained; raw provider messages are not exposed", async () => {
  const error = { message: "Unsupported provider: provider is not enabled" };
  await assert.rejects(signInWithGoogle({ auth: { signInWithOAuth: async () => ({ error }) } }, "http://127.0.0.1:5176"));
  assert.match(googleLoginError(error), /準備中/);
  assert.doesNotMatch(googleLoginError({ message: "secret" }), /secret/);
});
test("provider availability is checked using public settings before redirect", async () => {
  for (const enabled of [true, false]) {
    const request = async (url, options, timeout) => {
      assert.equal(url, "https://example.supabase.co/auth/v1/settings");
      assert.equal(options.headers.apikey, "public-test-key");
      assert.equal(timeout, 10000);
      return { response: { ok: true }, data: { external: { google: enabled } } };
    };
    const action = requireGoogleProvider({ mode: "supabase", url: "https://example.supabase.co", publishable_key: "public-test-key" }, request);
    if (enabled) await action; else await assert.rejects(action, /provider disabled/);
  }
  await assert.rejects(requireGoogleProvider({ mode: "local_test" }));
});
