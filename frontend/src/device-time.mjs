export function deviceTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function localDate(now = new Date(), zone = deviceTimezone()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function withDeviceTimezone(payload) {
  return payload?.birth_date ? { ...payload, display_timezone_name: deviceTimezone() } : payload;
}

export function deviceClockKey() {
  return `${deviceTimezone()}:${localDate()}`;
}

export function storedDisplayTimezone(payload) {
  return payload?.meta?.display_timezone_name || payload?.display_timezone_name
    || payload?.storage_meta?.display_timezone_name || "";
}

export function isSameDisplayTimezone(payload) {
  return storedDisplayTimezone(payload) === deviceTimezone();
}
