import React from "react";
import { createRoot } from "react-dom/client";
import { Dashboard, dashboardData } from "./dashboard-shared.jsx";
import { getStoredReadingResult, getStoredReadingResultAsync } from "./reading-storage.js";

const root = createRoot(document.getElementById("root"));

function dashboardDataFromPayload(payload) {
  if (!payload?.dashboard_data && !(payload?.yearly_forecast || payload?.yearlyForecast)) {
    return null;
  }
  const sourceDashboard = payload.dashboard_data || dashboardData;
  const yearlyForecast = payload.yearly_forecast || payload.yearlyForecast || null;
  return {
    ...sourceDashboard,
    readings: payload.readings || [],
    meta: payload.meta || {},
    chart_data: payload.chart_data || {},
    yearly_forecast: yearlyForecast,
    reading_date:
      sourceDashboard.reading_date ||
      sourceDashboard.readingDate ||
      yearlyForecast?.reading_date ||
      yearlyForecast?.date ||
      payload.meta?.reading_date ||
      payload.meta?.date,
  };
}

function render(data) {
  root.render(
    <React.StrictMode>
      <Dashboard data={data || dashboardData} />
    </React.StrictMode>
  );
}

render(dashboardDataFromPayload(getStoredReadingResult({ allowStale: true })) || dashboardData);

getStoredReadingResultAsync({ allowStale: true })
  .then((payload) => {
    render(dashboardDataFromPayload(payload) || dashboardData);
  })
  .catch(() => {});
