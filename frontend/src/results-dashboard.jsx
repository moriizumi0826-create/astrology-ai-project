import React from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "./dashboard-shared.jsx";
import { getStoredReadingResult } from "./reading-storage.js";

const mountNode = document.getElementById("dashboard-prototype");

function isDeveloperMode() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("mode") === "developer";
  } catch {
    return false;
  }
}

function getDashboardData() {
  const payload = getStoredReadingResult();
  if (!payload?.dashboard_data) {
    return null;
  }
  return {
    ...payload.dashboard_data,
    yearly_forecast: payload.yearly_forecast || payload.yearlyForecast || null,
    reading_date:
      payload.dashboard_data.reading_date ||
      payload.dashboard_data.readingDate ||
      payload.yearly_forecast?.reading_date ||
      payload.yearly_forecast?.date ||
      payload.meta?.reading_date ||
      payload.meta?.date,
  };
}

const data = getDashboardData();

if (mountNode && data) {
  createRoot(mountNode).render(
    <React.StrictMode>
      <Dashboard data={data} embedded developerMode={isDeveloperMode()} />
    </React.StrictMode>
  );
}
