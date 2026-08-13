import assert from "node:assert/strict";
import test from "node:test";

import {
  hasMonthlyOverviewMonth,
  hasMonthlyOverviewSupport,
  monthlyOverviewForDate,
  monthlyOverviewForDay,
  sortMonthlyOverviewAdditions,
} from "../src/monthly-overview.mjs";


test("detects forecasts generated with monthly overview support", () => {
  assert.equal(hasMonthlyOverviewSupport({ monthly_overview_schema: 1 }), true);
  assert.equal(hasMonthlyOverviewSupport({ monthlyOverviewSchema: 1 }), true);
  assert.equal(hasMonthlyOverviewSupport({ monthly_overviews: { "2026-08": [] } }), true);
  assert.equal(hasMonthlyOverviewSupport({ monthly_overviews: {} }), false);
  assert.equal(hasMonthlyOverviewSupport({ yearly_data: [] }), false);
});

test("distinguishes a loaded empty month from a month not requested yet", () => {
  const forecast = { monthly_overviews: { "2026-08": [] } };

  assert.equal(hasMonthlyOverviewMonth(forecast, 2026, 7), true);
  assert.equal(hasMonthlyOverviewMonth(forecast, 2026, 8), false);
  assert.equal(hasMonthlyOverviewMonth({ monthlyOverviews: { "2026-08": [] } }, 2026, 7), true);
});


test("selects the overview matching the active month and day", () => {
  const forecast = {
    monthly_overviews: {
      "2026-08": [
        { as_of: "2026-08-01", editorial: { Title: "first" } },
        { as_of: "2026-08-11", editorial: { Title: "ingress" } },
      ],
    },
  };

  const result = monthlyOverviewForDay(forecast, 2026, 7, { date: "2026-08-11" });

  assert.equal(result.editorial.Title, "ingress");
});

test("supports camel-case API aliases and falls back within the month", () => {
  const forecast = {
    monthlyOverviews: {
      "2026-08": [{ asOf: "2026-08-01", editorial: { Title: "fallback" } }],
    },
  };

  assert.equal(
    monthlyOverviewForDay(forecast, 2026, 7, "2026-08-20").editorial.Title,
    "fallback",
  );
  assert.equal(monthlyOverviewForDay(forecast, 2026, 6, "2026-07-20"), null);
});

test("selects the daily-page monthly overview from an ISO date", () => {
  const forecast = {
    monthly_overviews: {
      "2026-08": [
        { as_of: "2026-08-10", editorial: { Title: "before" } },
        { as_of: "2026-08-13", editorial: { Title: "current" } },
      ],
    },
  };

  assert.equal(monthlyOverviewForDate(forecast, "2026-08-13").editorial.Title, "current");
  assert.equal(monthlyOverviewForDate(forecast, "2026-07-13"), null);
  assert.equal(monthlyOverviewForDate(forecast, "invalid"), null);
});

test("sorts event paragraphs and aspect clusters together by their actual dates", () => {
  const entries = sortMonthlyOverviewAdditions(
    [
      { Template_ID: "late-event", Event_Date: "2026-09-23", Section_Order: "30", Priority: "100" },
      { Template_ID: "same-day-event", Event_Date: "2026-09-12", Section_Order: "40", Priority: "100" },
      { Template_ID: "missing-date", Section_Order: "10", Priority: "100" },
    ],
    [
      { Template_ID: "opening-cluster", Peak_At: "2026-09-01T07:17:00+09:00", Section_Order: "95", Priority: "80" },
      { Template_ID: "same-day-cluster", Peak_At: "2026-09-12T14:00:00+09:00", Section_Order: "20", Priority: "100" },
    ],
  );

  assert.deepEqual(
    entries.map(({ row }) => row.Template_ID),
    ["opening-cluster", "same-day-cluster", "same-day-event", "late-event", "missing-date"],
  );
});
