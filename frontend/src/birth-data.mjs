import { birthSearchScope, normalizeBirthDate, normalizeBirthTime } from "./birth-input.mjs";
export { normalizeBirthDate, normalizeBirthTime, buildBirthRequest as buildReadingRequest } from "./birth-input.mjs";

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




export function initialBirthData(saved = {}, meta = {}) {
  const birthTimeUnknown = Boolean(saved.birth_time_unknown ?? meta.birth_time_unknown);
  const scope = birthSearchScope({ ...meta, ...saved });
  const timezoneName = String(saved.timezone_name || meta.timezone_name || (scope === "JP" && saved.timezone_offset == null ? "Asia/Tokyo" : ""));
  return {
    full_name: String(saved.full_name || meta.full_name || meta.name || ""),
    birth_date: normalizeBirthDate(saved.birth_date || meta.birth_date),
    birth_time: birthTimeUnknown ? "" : normalizeBirthTime(saved.birth_time || meta.birth_time),
    birth_time_unknown: birthTimeUnknown,
    birth_prefecture: String(saved.birth_prefecture || ""),
    birth_country: scope,
    birth_time_fold: String(saved.birth_time_fold ?? meta.birth_time_fold ?? ""),
    birthplace: String(saved.birthplace || ""),
    resolved_birthplace: String(saved.resolved_birthplace || meta.birthplace || meta.location || ""),
    latitude: saved.latitude === null || saved.latitude === undefined ? "" : String(saved.latitude),
    longitude: saved.longitude === null || saved.longitude === undefined ? "" : String(saved.longitude),
    timezone_offset: saved.timezone_offset === null || saved.timezone_offset === undefined
      ? ""
      : String(saved.timezone_offset),
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
    birth_country: birthSearchScope(form),
    birth_time_fold: form.birth_time_fold === "" || form.birth_time_fold == null ? null : Number(form.birth_time_fold),
    birthplace: String(form.birthplace || ""),
    resolved_birthplace: String(form.resolved_birthplace || ""),
    latitude: String(form.latitude ?? ""),
    longitude: String(form.longitude ?? ""),
    timezone_offset: String(form.timezone_offset ?? ""),
    timezone_name: String(form.timezone_name || ""),
  };
}
