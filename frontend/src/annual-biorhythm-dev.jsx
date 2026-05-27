import React from "react";
import { createRoot } from "react-dom/client";
import { AnnualBiorhythmDeveloperView, dashboardData } from "./dashboard-shared.jsx";
import {
  getStoredReadingResult,
  getStoredReadingResultAsync,
} from "./reading-storage.js";

const mountNode = document.getElementById("annual-biorhythm-dev");
const root = mountNode ? createRoot(mountNode) : null;

function developerDataFromPayload(payload) {
  if (!payload?.dashboard_data) {
    return dashboardData;
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

function render(data) {
  if (!root) return;
  root.render(
    <React.StrictMode>
      <AnnualBiorhythmDeveloperView data={data} />
    </React.StrictMode>
  );
}

render(developerDataFromPayload(getStoredReadingResult({ allowStale: true })));

getStoredReadingResultAsync({ allowStale: true })
  .then((payload) => {
    render(developerDataFromPayload(payload));
  })
  .catch(() => {
    // Keep the initial developer view visible if IndexedDB is unavailable.
  });
