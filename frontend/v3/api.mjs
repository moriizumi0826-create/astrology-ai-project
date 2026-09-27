import { normalizeReadingRequest } from "./reading-storage.js";
import { requestJsonWithTimeout } from "../src/request-timeout.mjs";
import { authSnapshot, assertSameIdentity } from "./auth-client.mjs";
import { apiUrl, resolveApiBaseUrl } from "./api-origin.mjs";

export function apiPath(path) {
  if (!path.startsWith("/api/") || path.includes("://") || path.includes("..")) throw new Error("Invalid V3 API path");
  if (path.startsWith("/api/v3/")) return path;
  return path.replace("/api/v2/aspect-interpretations", "/api/aspect-interpretations").replace(/^\/api\//, "/api/v3/");
}
export { resolveApiBaseUrl };
export function getQueryReadingForm() { return null; } // never accept birth data or API overrides from the URL
export function formatApiError(detail, fallback) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map(item => item.msg || "入力を確認してください").join(" / ");
  return fallback;
}
export async function requestJson(path, payload, method = "POST", timeoutMs = 180000) {
  const identity = await authSnapshot();
  const normalized = payload?.birth_date ? normalizeReadingRequest(payload) : payload;
  const { response, data } = await requestJsonWithTimeout(apiUrl(apiPath(path)), {
    method, headers: { "Content-Type": "application/json", ...identity.headers }, cache: "no-store",
    body: method === "GET" || normalized === undefined ? undefined : JSON.stringify(normalized),
  }, timeoutMs);
  await assertSameIdentity(identity);
  return { ok: response.ok, status: response.status, data };
}
async function json(path, payload, method, timeoutMs) {
  const response = await requestJson(path, payload, method, timeoutMs);
  if (!response.ok) {
    const error = new Error(formatApiError(response.data?.detail, `APIエラー（${response.status}）`));
    error.status = response.status;
    throw error;
  }
  return response.data;
}
export const getJson = path => json(path, undefined, "GET");
export const postJson = (path, payload) => json(path, payload, "POST");
export const putJson = (path, payload) => json(path, payload, "PUT");
export const deleteJson = (path, payload) => json(path, payload, "DELETE");
// Existing paid refresh UI may check version, but must never invoke an admin mutation.
export const reloadCsvMasters = () => getJson("/api/master-version");
export const searchBirthLocations = async values => {
  const { q, prefecture, country_code, limit } = values;
  try {
    return await json("/api/location-search", { q, prefecture, country_code, limit }, "POST", 20000);
  } catch (error) {
    if (error.name === "RequestTimeoutError") {
      throw new Error("出生地検索がタイムアウトしました。時間をおいて再試行してください。");
    }
    throw error;
  }
};
