// Birthplace time is independent of the device's present timezone.
export function birthSearchScope(saved = {}) {
  return saved.birth_country || (saved.timezone_name && saved.timezone_name !== "Asia/Tokyo" ? "WORLD" : "JP");
}

export function birthTimezoneNames() {
  const common = ["UTC", "Asia/Tokyo", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Kathmandu", "Australia/Sydney"];
  try { return [...new Set([...common, ...Intl.supportedValuesOf("timeZone")])].sort(); }
  catch { return common; }
}

export function normalizeBirthDate(value) {
  const match = String(value || "").trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!match) return "";
  const [, y, m, d] = match;
  const normalized = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const parsed = new Date(`${normalized}T00:00:00Z`);
  return parsed.getUTCFullYear() === Number(y) && parsed.getUTCMonth() + 1 === Number(m)
    && parsed.getUTCDate() === Number(d) ? normalized : "";
}

export function normalizeBirthTime(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return "";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function birthLocationQuery(form) {
  const country = birthSearchScope(form);
  const city = String(form.birthplace || "").trim();
  const prefecture = country === "JP" ? String(form.birth_prefecture || "").trim() : "";
  if (!city || (country === "JP" && !prefecture)) {
    throw new Error(country === "JP" ? "都道府県と市区町村を入力してください。" : "都市名・地域名・国名を入力してください（例: Paris, France）。");
  }
  return { q: city, prefecture, country_code: country };
}

function coordinate(value, label, min, max) {
  const number = String(value ?? "").trim() === "" ? NaN : Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`${label}を正しく入力するか、出生地を検索してください。`);
  }
  return number;
}

export function buildBirthRequest(form) {
  const full_name = String(form.full_name || "").trim();
  if (!full_name) throw new Error("氏名を入力してください。");
  const birth_date = normalizeBirthDate(form.birth_date);
  if (!birth_date) throw new Error("生年月日を正しく入力してください。");
  const birth_time_unknown = Boolean(form.birth_time_unknown);
  const birth_time = birth_time_unknown ? null : normalizeBirthTime(form.birth_time);
  if (!birth_time_unknown && !birth_time) throw new Error("出生時刻を正しく入力してください。");
  let birthplace = String(form.resolved_birthplace || "").trim();
  if (!birthplace) {
    const query = birthLocationQuery(form);
    birthplace = query.country_code === "JP" ? `${query.q}, ${query.prefecture}, Japan` : query.q;
  }
  const latitude = coordinate(form.latitude, "緯度", -90, 90);
  const longitude = coordinate(form.longitude, "経度", -180, 180);
  const timezone_name = String(form.timezone_name || "").trim() || null;
  const offsetText = String(form.timezone_offset ?? "").trim();
  const timezone_offset = offsetText === "" ? null : Number(offsetText);
  if (timezone_name) {
    try { new Intl.DateTimeFormat("en", { timeZone: timezone_name }); }
    catch { throw new Error("出生地のタイムゾーン名を確認してください（例: America/New_York）。"); }
  } else if (timezone_offset === null) {
    throw new Error("出生地のタイムゾーンを指定するか、出生地を検索してください。");
  }
  if (timezone_offset !== null && (!Number.isFinite(timezone_offset) || timezone_offset < -12 || timezone_offset > 14)) {
    throw new Error("UTCオフセットを正しく入力してください。");
  }
  const foldText = String(form.birth_time_fold ?? "");
  if (!["", "0", "1"].includes(foldText)) throw new Error("時刻が重複する場合の指定を確認してください。");
  return { full_name, birth_date, birth_time, birth_time_unknown, birthplace, latitude, longitude,
    timezone_name, timezone_offset, ...(foldText !== "" ? { birth_time_fold: Number(foldText) } : {}) };
}
