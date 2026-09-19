import { requestJsonWithTimeout } from "../src/request-timeout.mjs";
import { apiUrl } from "./api-origin.mjs";

let client = null;
let config = null;
let initialization;
let subject;
let epoch = 0;

export function initializeAuth() {
  if (!initialization) initialization = (async () => {
    const { response, data } = await requestJsonWithTimeout(apiUrl("/api/v3/auth/config"), { cache: "no-store" }, 15000);
    if (!response.ok || !["supabase", "local_test"].includes(data?.mode)) throw new Error("認証設定を取得できません。再読み込みしてください。");
    config = data;
    if (data.mode === "supabase" && !client) {
      const { createClient } = await import("@supabase/supabase-js");
      client = createClient(data.url, data.publishable_key, { auth: {
        flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true,
        storageKey: `celestial-atelier:v3:auth:${new URL(data.url).hostname}`,
      } });
      client.auth.onAuthStateChange((_event, session) => {
        const next = session?.user?.id || null;
        if (subject !== undefined && next !== subject) {
          epoch += 1;
          window.dispatchEvent(new CustomEvent("v3-auth-changed"));
        }
        subject = next;
      });
      const { error } = await client.auth.getSession();
      if (error) throw new Error("ログイン情報を復元できません。再ログインしてください。");
    }
    return config;
  })().catch(error => { initialization = null; throw error; });
  return initialization;
}

export function isMemberMode() { return config?.mode === "supabase"; }
export async function authClient() {
  await initializeAuth();
  if (!client) throw new Error("Supabaseの接続設定が必要です。");
  return client;
}
export async function authSnapshot() {
  if (!client) return { headers: {}, subject: null, epoch };
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error("ログイン情報を更新できません。再ログインしてください。");
  return { headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {},
    subject: data.session?.user?.id || null, epoch };
}
export async function assertSameIdentity(before) {
  const after = await authSnapshot();
  if (before.subject !== after.subject || before.epoch !== after.epoch) throw new Error("ログイン状態が変わりました。画面を開き直してください。");
}
export function authMessage(error) {
  const code = error?.code || "";
  if (code === "invalid_credentials") return "メールアドレスまたはパスワードが違います。";
  if (code === "email_not_confirmed") return "確認メールのリンクを開いてからログインしてください。";
  if (/rate_limit|over_.*limit/.test(code)) return "操作回数の上限に達しました。時間をおいて再試行してください。";
  if (["weak_password", "same_password"].includes(code)) return "12文字以上の、新しい強いパスワードを設定してください。";
  return "認証処理を完了できませんでした。入力・メールの有効期限・通信状態を確認してください。";
}
