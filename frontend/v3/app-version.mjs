export async function fetchAppVersion(currentBuildId, { fetcher = fetch, signal } = {}) {
  const response = await fetcher(`/version.json?_check=${Date.now()}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error("更新状況を確認できません。再確認してください。");
  const payload = await response.json();
  if (typeof payload.buildId !== "string" || !payload.buildId.trim()) throw new Error("更新情報を取得できません。再確認してください。");
  return { currentBuildId, latestBuildId: payload.buildId, isAppOutdated: currentBuildId !== payload.buildId };
}

export function reloadLatestApp(location, now = Date.now()) {
  const url = new URL(location.href);
  url.searchParams.set("_app_refresh", String(now));
  location.replace(url.toString());
}
