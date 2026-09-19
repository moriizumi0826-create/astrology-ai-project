import { initializeAuth } from "./auth-client.mjs";
import { getJson, putJson } from "./api.mjs";
import { configureStorage, storageOwner, getStoredReadingForm, storeReadingForm, clearReadingResult, normalizeReadingRequest } from "./reading-storage.js";

let owner;
let revision = null;
let hydrated = false;

export function birthProfile(form) {
  const normalized = normalizeReadingRequest(form);
  const fields = ["full_name", "birth_date", "birth_time", "birth_time_unknown", "birthplace", "latitude", "longitude", "timezone_offset", "timezone_name", "birth_time_fold", "birth_country", "birth_prefecture"];
  return Object.fromEntries(fields.filter(key => normalized[key] !== undefined).map(key => [key, normalized[key]]));
}
export async function prepareSession() {
  await initializeAuth();
  const session = await getJson("/api/v3/session");
  if (storageOwner() !== encodeURIComponent(session.user_id || "anonymous")) hydrated = false;
  configureStorage(session);
  if (owner !== session.user_id) { owner = session.user_id; hydrated = false; revision = null; }
  if (String(owner || "").startsWith("supabase:") && !hydrated) {
    const expectedOwner = owner;
    const { saved } = await getJson("/api/v3/profile");
    if (owner !== expectedOwner) throw new Error("会員が切り替わりました。再読み込みしてください。");
    storeReadingForm(saved?.profile || null);
    clearReadingResult();
    revision = saved?.revision ?? null;
    hydrated = true;
  }
  return session;
}
export async function saveMemberProfile(form) {
  if (!String(owner || "").startsWith("supabase:")) return;
  if (!hydrated) throw new Error("保存済みの出生情報を確認してから再試行してください。");
  const expectedOwner = owner;
  const { saved } = await putJson("/api/v3/profile", { profile: birthProfile(form), expected_revision: revision });
  if (owner !== expectedOwner) throw new Error("会員が切り替わりました。再読み込みしてください。");
  revision = saved.revision;
}
export async function finishMemberLogin(anonymousForm, transfer) {
  const session = await prepareSession();
  if (!session.user_id) throw new Error("メール確認を完了してログインしてください。");
  if (transfer && anonymousForm && !getStoredReadingForm()) {
    await saveMemberProfile(anonymousForm);
    storeReadingForm(anonymousForm);
  }
  return session;
}
