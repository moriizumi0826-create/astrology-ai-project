import assert from "node:assert/strict";
import test from "node:test";

import {
  hasMonthlyOverviewSupport,
  monthlyOverviewForDate,
  monthlyOverviewForDay,
} from "../src/monthly-overview.mjs";


test("detects forecasts generated with monthly overview support", () => {
  assert.equal(hasMonthlyOverviewSupport({ monthly_overview_schema: 1 }), true);
  assert.equal(hasMonthlyOverviewSupport({ monthlyOverviewSchema: 1 }), true);
  assert.equal(hasMonthlyOverviewSupport({ monthly_overviews: { "2026-08": [] } }), true);
  assert.equal(hasMonthlyOverviewSupport({ monthly_overviews: {} }), false);
  assert.equal(hasMonthlyOverviewSupport({ yearly_data: [] }), false);
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
