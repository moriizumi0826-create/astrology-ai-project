function monthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function overviewDateKey(value) {
  return String(value || "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "9999-12-31";
}

export function sortMonthlyOverviewAdditions(eventParagraphs = [], aspectClusters = []) {
  const entries = [
    ...(Array.isArray(eventParagraphs) ? eventParagraphs : []).map((row) => ({
      kind: "event",
      row,
      date: overviewDateKey(row?.Event_Date || row?.eventDate),
    })),
    ...(Array.isArray(aspectClusters) ? aspectClusters : []).map((row) => ({
      kind: "aspect",
      row,
      date: overviewDateKey(row?.Peak_At || row?.peakAt),
    })),
  ];

  return entries.sort((left, right) => (
    left.date.localeCompare(right.date)
    || (Number(left.row?.Section_Order || left.row?.sectionOrder) || 0)
      - (Number(right.row?.Section_Order || right.row?.sectionOrder) || 0)
    || (Number(right.row?.Priority || right.row?.priority) || 0)
      - (Number(left.row?.Priority || left.row?.priority) || 0)
    || String(left.row?.Template_ID || left.row?.templateId || "")
      .localeCompare(String(right.row?.Template_ID || right.row?.templateId || ""))
  ));
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
