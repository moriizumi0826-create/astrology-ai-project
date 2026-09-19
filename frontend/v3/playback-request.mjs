import { postJson } from "./api.mjs";

// V3 always requires the guarded batch route for playback. Never silently
// substitute unrestricted single-date requests if that route is unavailable.
export async function requestPlaybackCharts(path, payload) {
  try { return await postJson(path, payload); }
  catch (error) {
    if ([404, 405].includes(error.status)) {
      error.status = 503;
      error.message = "V3の再生APIが利用できません。バックエンドを更新・再起動してください。";
    }
    throw error;
  }
}
