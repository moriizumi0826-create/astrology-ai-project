import React from "react";
import { createRoot } from "react-dom/client";
import { Dashboard, dashboardData } from "./dashboard-shared.jsx";

const mountNode = document.getElementById("dashboard-prototype");
const RESULT_STORAGE_KEY = "celestial-atelier:last-reading-result";

function isDeveloperMode() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get("mode") === "developer";
  } catch {
    return false;
  }
}

function getDashboardData() {
  try {
    const raw = window.sessionStorage.getItem(RESULT_STORAGE_KEY);
    if (!raw) return dashboardData;

    const payload = JSON.parse(raw);
    if (!payload?.dashboard_data) return dashboardData;

    return payload.dashboard_data;
  } catch {
    return dashboardData;
  }
}

if (mountNode) {
  createRoot(mountNode).render(
    <React.StrictMode>
      <Dashboard data={getDashboardData()} embedded developerMode={isDeveloperMode()} />
    </React.StrictMode>
  );
}
