import React from "react";
import { createRoot } from "react-dom/client";
import { Dashboard, dashboardData } from "./dashboard-shared.jsx";

const basicTexts = {
  general: "全体運の基本解釈がここに表示されます。長い文章でもカード内で折り返して最後まで読める状態です。",
  love: "恋愛面の基本解釈がここに表示されます。関係性の温度感や距離の取り方を確認できます。",
  work: "仕事面の基本解釈がここに表示されます。集中しやすい領域や成果につながる行動を確認できます。",
  human: "対人面の基本解釈がここに表示されます。周囲との調和やコミュニケーション傾向を確認できます。",
  health: "健康面の基本解釈がここに表示されます。休息や体調管理の注意点を確認できます。",
};

const data = {
  ...dashboardData,
  header: {
    brand: {
      name: "Snapshot",
      sublabel: "Personal Reading Preview",
    },
    actions: [],
  },
  basic_interpretations: [
    {
      Text_General: basicTexts.general,
      Text_Love: basicTexts.love,
      Text_Work: basicTexts.work,
      Text_Human: basicTexts.human,
      Text_Health: basicTexts.health,
    },
  ],
  countdown: { label: "短期", title: "対象アスペクトなし", days_remaining: null, progress: 0 },
  yearlyForecast: { reading_date: "2026-02-16" },
  timeline: [],
  timelineDays: [],
};

createRoot(document.getElementById("root")).render(<Dashboard data={data} embedded />);
