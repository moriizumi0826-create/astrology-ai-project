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
  diagnostic: {
    theme: "ロジック安定指標",
    total_score: 50,
    lines: [
      { label: "意思決定の整合性", score: 82, text: "仕事運と日運の効率補正から、判断軸のブレにくさを算出しています。" },
      { label: "感情と行動の同期", score: 68, text: "月や愛情・健康テーマのアスペクトから、内面と行動の噛み合いを見ています。" },
      { label: "外部ノイズ耐性", score: 74, text: "負荷の強いアスペクトと安全度補正から、外圧への耐性を可視化しています。" },
    ],
  },
  hero: {
    label: "PERSONAL READING",
    title: "慎重に余白を守る日",
    subtitle: "達成した成果を自分のキャリアシートに追記",
    description: "ネイタル水星とトランジット太陽が120度を形成し、職務上の覚醒と有能さの発揮のピークを穏やかに過ぎたところです。",
    summary: "離脱中の今は、得られた成果や評価を日常の業務に馴染ませる時期です。静かに自分の専門性を高めていく時期です。",
    guideline: "健康面の基本解釈がここに表示されます。休息や体調管理の注意点を確認できます。",
    rank: "E",
    basicTexts,
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
