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
  return payload?.dashboard_data || null;
}

const data = getDashboardData();

if (mountNode && data) {
  createRoot(mountNode).render(
    <React.StrictMode>
      <Dashboard data={data} embedded developerMode={isDeveloperMode()} />
    </React.StrictMode>
  );
}
