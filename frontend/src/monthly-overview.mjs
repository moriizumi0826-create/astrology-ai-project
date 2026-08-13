function monthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function hasMonthlyOverviewSupport(forecast) {
  const schemaVersion = Number(
    forecast?.monthly_overview_schema
    || forecast?.monthlyOverviewSchema
    || 0,
  );
  const overviews = forecast?.monthly_overviews || forecast?.monthlyOverviews;
  return schemaVersion >= 1 || Boolean(
    overviews && typeof overviews === "object" && Object.keys(overviews).length,
  );
}

export function hasMonthlyOverviewMonth(forecast, year, monthIndex) {
  const source = forecast?.monthly_overviews || forecast?.monthlyOverviews;
  return Boolean(
    source
    && typeof source === "object"
    && Object.prototype.hasOwnProperty.call(source, monthKey(year, monthIndex)),
  );
}

export function monthlyOverviewForDay(forecast, year, monthIndex, day) {
  const source = forecast?.monthly_overviews || forecast?.monthlyOverviews || {};
  const monthRows = source[monthKey(year, monthIndex)];
  if (!Array.isArray(monthRows) || !monthRows.length) return null;

  const targetDate = typeof day === "string" ? day : day?.date;
  return monthRows.find((overview) => (
    overview?.as_of === targetDate || overview?.asOf === targetDate
  )) || monthRows[0] || null;
}

export function monthlyOverviewForDate(forecast, dateValue) {
  const match = String(dateValue || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return monthlyOverviewForDay(
    forecast,
    Number(match[1]),
    Number(match[2]) - 1,
    `${match[1]}-${match[2]}-${match[3]}`,
  );
}
