import React from "react";
import { createRoot } from "react-dom/client";
import { Dashboard, dashboardData } from "./dashboard-shared.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Dashboard data={dashboardData} />
  </React.StrictMode>
);
