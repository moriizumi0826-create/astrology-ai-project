import React from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "./dashboard-shared.jsx";
import {
  getStoredReadingForm,
  getStoredReadingResult,
  getStoredReadingResultAsync,
  isStoredResultFresh,
  storeReadingResult,
} from "./reading-storage.js";

const mountNode = document.getElementById("dashboard-prototype");
const dashboardRoot = mountNode ? createRoot(mountNode) : null;

function resolveApiBaseUrl() {
  const configured = String(__APP_API_BASE_URL__ || "").trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  return window.location.origin.replace(/\/$/, "");
}

async function postJson(path, payload) {
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.detail || `Request failed: ${response.status}`);
  }
  return response.json();
}

function isDeveloperMode() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("mode") === "developer";
  } catch {
    return false;
  }
}

function getDashboardData() {
  const payload = getStoredReadingResult({ allowStale: true });
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

async function refreshDailyDashboardIfNeeded() {
  const payload = await getStoredReadingResultAsync({ allowStale: true });
  if (!payload || isStoredResultFresh(payload)) {
    return payload;
  }

  const formPayload = getStoredReadingForm();
  if (!formPayload) {
    return payload;
  }

  const refreshed = await postJson("/api/readings", formPayload);
  const merged = {
    ...refreshed,
    yearly_forecast: payload.yearly_forecast || payload.yearlyForecast || refreshed.yearly_forecast || null,
  };
  await storeReadingResult(merged);
  return merged;
}

function dashboardDataFromPayload(payload) {
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

function renderDashboard(data) {
  if (!dashboardRoot || !data) {
    return;
  }
  dashboardRoot.render(
    <React.StrictMode>
      <Dashboard data={data} embedded developerMode={isDeveloperMode()} />
    </React.StrictMode>
  );
}

renderDashboard(getDashboardData());

getStoredReadingResultAsync({ allowStale: true })
  .then((payload) => {
    const data = dashboardDataFromPayload(payload);
    if (data) {
      renderDashboard(data);
    }
    return refreshDailyDashboardIfNeeded();
  })
  .then((payload) => {
    const data = dashboardDataFromPayload(payload);
    if (data) {
      renderDashboard(data);
    }
  })
  .catch(() => {
    // Keep the stored dashboard visible if a refresh fails.
  });
