import { requestJsonWithTimeout } from "../src/request-timeout.mjs";

export async function requireGoogleProvider(config, request = requestJsonWithTimeout) {
  if (config?.mode !== "supabase") throw new Error("provider disabled");
  const { response, data } = await request(`${config.url}/auth/v1/settings`, {
    headers: { apikey: config.publishable_key }, cache: "no-store",
  }, 10000);
  if (!response.ok) throw new Error("Google provider settings unavailable");
  if (data?.external?.google !== true) throw new Error("provider disabled");
}

// Authentication only: do not request Calendar scopes or keep Google provider tokens.
export async function signInWithGoogle(client, origin) {
  const redirectTo = new URL("/auth-callback.html?mode=google", origin).href;
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, queryParams: { prompt: "select_account" } },
  });
  if (error) throw error;
}

export function googleLoginError(error) {
  if (/provider.*(disabled|not.*enabled)|unsupported.*provider/i.test(`${error?.code || ""} ${error?.message || ""}`)) {
    return "Googleログインは準備中です。メールアドレスでログインしてください。";
  }
  return "Googleログインを開始できませんでした。時間をおいて再試行するか、メールアドレスでログインしてください。";
}
