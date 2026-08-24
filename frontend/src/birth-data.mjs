export const PREFECTURE_OPTIONS = [
  ["Hokkaido", "北海道"],
  ["Aomori", "青森県"],
  ["Iwate", "岩手県"],
  ["Miyagi", "宮城県"],
  ["Akita", "秋田県"],
  ["Yamagata", "山形県"],
  ["Fukushima", "福島県"],
  ["Ibaraki", "茨城県"],
  ["Tochigi", "栃木県"],
  ["Gunma", "群馬県"],
  ["Saitama", "埼玉県"],
  ["Chiba", "千葉県"],
  ["Tokyo", "東京都"],
  ["Kanagawa", "神奈川県"],
  ["Niigata", "新潟県"],
  ["Toyama", "富山県"],
  ["Ishikawa", "石川県"],
  ["Fukui", "福井県"],
  ["Yamanashi", "山梨県"],
  ["Nagano", "長野県"],
  ["Gifu", "岐阜県"],
  ["Shizuoka", "静岡県"],
  ["Aichi", "愛知県"],
  ["Mie", "三重県"],
  ["Shiga", "滋賀県"],
  ["Kyoto", "京都府"],
  ["Osaka", "大阪府"],
  ["Hyogo", "兵庫県"],
  ["Nara", "奈良県"],
  ["Wakayama", "和歌山県"],
  ["Tottori", "鳥取県"],
  ["Shimane", "島根県"],
  ["Okayama", "岡山県"],
  ["Hiroshima", "広島県"],
  ["Yamaguchi", "山口県"],
  ["Tokushima", "徳島県"],
  ["Kagawa", "香川県"],
  ["Ehime", "愛媛県"],
  ["Kochi", "高知県"],
  ["Fukuoka", "福岡県"],
  ["Saga", "佐賀県"],
  ["Nagasaki", "長崎県"],
  ["Kumamoto", "熊本県"],
  ["Oita", "大分県"],
  ["Miyazaki", "宮崎県"],
  ["Kagoshima", "鹿児島県"],
  ["Okinawa", "沖縄県"],
].map(([value, label]) => ({ value, label }));

export function normalizeBirthDate(value) {
  const match = String(value || "").trim().match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!match) return "";
  const [, year, month, day] = match;
  const normalized = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  if (
    parsed.getFullYear() !== Number(year)
    || parsed.getMonth() + 1 !== Number(month)
    || parsed.getDate() !== Number(day)
  ) return "";
  return normalized;
}

export function normalizeBirthTime(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function defaultTimezoneName() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";
  } catch {
    return "Asia/Tokyo";
  }
}

export function defaultTimezoneOffset(timezoneName = defaultTimezoneName()) {
  if (timezoneName === "Asia/Tokyo") return "9";
  return String(new Date().getTimezoneOffset() / -60);
}

export function initialBirthData(saved = {}, meta = {}) {
  const birthTimeUnknown = Boolean(saved.birth_time_unknown ?? meta.birth_time_unknown);
  const timezoneName = String(saved.timezone_name || meta.timezone_name || defaultTimezoneName());
  return {
    full_name: String(saved.full_name || meta.full_name || meta.name || ""),
    birth_date: normalizeBirthDate(saved.birth_date || meta.birth_date),
    birth_time: birthTimeUnknown ? "" : normalizeBirthTime(saved.birth_time || meta.birth_time),
    birth_time_unknown: birthTimeUnknown,
    birth_prefecture: String(saved.birth_prefecture || ""),
    birthplace: String(saved.birthplace || ""),
    resolved_birthplace: String(saved.resolved_birthplace || meta.birthplace || meta.location || ""),
    latitude: saved.latitude === null || saved.latitude === undefined ? "" : String(saved.latitude),
    longitude: saved.longitude === null || saved.longitude === undefined ? "" : String(saved.longitude),
    timezone_offset: saved.timezone_offset === null || saved.timezone_offset === undefined
      ? defaultTimezoneOffset(timezoneName)
      : String(saved.timezone_offset),
    timezone_name: timezoneName,
  };
}

function requiredNumber(value, label, min, max) {
  const normalized = String(value ?? "").trim();
  const numeric = normalized === "" ? Number.NaN : Number(normalized);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new Error(`${label}を正しく入力するか、出生地を検索してください。`);
  }
  return numeric;
}

export function buildReadingRequest(form) {
  const fullName = String(form?.full_name || "").trim();
  if (!fullName) throw new Error("氏名を入力してください。");

  const birthDate = normalizeBirthDate(form?.birth_date);
  if (!birthDate) throw new Error("生年月日を入力してください。");

  const birthTimeUnknown = Boolean(form?.birth_time_unknown);
  const birthTime = birthTimeUnknown ? null : normalizeBirthTime(form?.birth_time);
  if (!birthTimeUnknown && !birthTime) throw new Error("出生時刻を入力してください。");

  const city = String(form?.birthplace || "").trim();
  const prefecture = String(form?.birth_prefecture || "").trim();
  const resolvedBirthplace = String(form?.resolved_birthplace || "").trim();
  if (!resolvedBirthplace && (!city || !prefecture)) {
    throw new Error("都道府県と市区町村を入力し、出生地を検索してください。");
  }

  const latitude = requiredNumber(form?.latitude, "緯度", -90, 90);
  const longitude = requiredNumber(form?.longitude, "経度", -180, 180);
  const timezoneName = String(form?.timezone_name || "").trim() || null;
  const timezoneText = String(form?.timezone_offset ?? "").trim();
  const timezoneOffset = timezoneText === "" ? null : Number(timezoneText);
  if (timezoneOffset !== null && (!Number.isFinite(timezoneOffset) || timezoneOffset < -12 || timezoneOffset > 14)) {
    throw new Error("タイムゾーンを正しく入力するか、出生地を検索してください。");
  }
  if (timezoneOffset === null && !timezoneName) {
    throw new Error("タイムゾーンを取得できません。出生地を再検索してください。");
  }

  return {
    full_name: fullName,
    birth_date: birthDate,
    birth_time: birthTime,
    birth_time_unknown: birthTimeUnknown,
    birthplace: resolvedBirthplace || `${city}, ${prefecture}, Japan`,
    latitude,
    longitude,
    timezone_offset: timezoneOffset,
    timezone_name: timezoneName,
  };
}

export function birthFormSnapshot(form) {
  return {
    full_name: String(form.full_name || ""),
    birth_date: normalizeBirthDate(form.birth_date),
    birth_time: form.birth_time_unknown ? "" : normalizeBirthTime(form.birth_time),
    birth_time_unknown: Boolean(form.birth_time_unknown),
    birth_prefecture: String(form.birth_prefecture || ""),
    birthplace: String(form.birthplace || ""),
    resolved_birthplace: String(form.resolved_birthplace || ""),
    latitude: String(form.latitude ?? ""),
    longitude: String(form.longitude ?? ""),
    timezone_offset: String(form.timezone_offset ?? ""),
    timezone_name: String(form.timezone_name || ""),
  };
}
