// Only transport/server failures may retain an already verified workspace.
// Authentication errors and identity changes must still fail closed.
export function canRetainSession(error, session, owner) {
  if (!session || owner !== encodeURIComponent(session.user_id || "anonymous")) return false;
  const status = Number(error?.status);
  if (status) return status === 408 || status === 429 || (status >= 500 && status <= 599);
  return error?.name === "RequestTimeoutError" ||
    (error?.name === "TypeError" && /failed to fetch|networkerror|load failed|network request failed/i.test(error.message));
}
