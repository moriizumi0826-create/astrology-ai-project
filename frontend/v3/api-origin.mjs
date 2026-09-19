function configuredApiBaseUrl() {
  const value = String(typeof __APP_API_BASE_URL__ === "undefined" ? "" : __APP_API_BASE_URL__ || "").trim();
  return value.replace(/\/$/, "");
}

export function resolveApiBaseUrl() {
  return configuredApiBaseUrl();
}

export function apiUrl(path) {
  if (!path.startsWith("/api/") || path.includes("://") || path.includes("..")) {
    throw new Error("Invalid V3 API path");
  }
  return `${configuredApiBaseUrl()}${path}`;
}
