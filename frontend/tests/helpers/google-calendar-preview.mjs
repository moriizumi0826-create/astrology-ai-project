// Actual V3 calendar with synthetic events; no external authentication or data requests.
import { createServer } from "vite";
import config from "../../vite.v3.config.mjs";
const base = config({ mode: "development" });
const server = await createServer({ ...base, configFile: false,
  server: { ...base.server, port: 5190, strictPort: true },
  plugins: [...base.plugins, {
    name: "google-calendar-preview", enforce: "pre",
    resolveId(id) { if (id === "/calendar-preview.jsx") return "\0calendar-preview.jsx"; },
    load(id) {
      if (id.replaceAll("\\", "/").endsWith("/v3/api.mjs")) return "export const postJson=async()=>({});export const getJson=async()=>({notes:[]});export const putJson=async()=>({});export const deleteJson=async()=>({});";
      if (id !== "\0calendar-preview.jsx") return;
      return `import React from 'react';import {createRoot} from 'react-dom/client';import {DashboardV2CountdownCard} from '/dashboard-shared.jsx';import '/tailwind.css';
        const now=new Date();const date=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(now);const parts=date.split('-');const instant=parts.join('-')+'T09:15:00+09:00';
        const data={display_date:date,celestial_event_calendar:[{event_id:'fixture',event_type:'sign_ingress',event_date:date,event_datetime:instant,title:'火星が獅子座へ移動（テスト）',note:'表示確認用の架空イベントです。'}]};
        createRoot(document.getElementById('root')).render(React.createElement(DashboardV2CountdownCard,{calendarOnly:true,data}));`;
    },
    configureServer(server) {
      server.middlewares.use("/google-calendar-preview", async (_req, res) => {
        res.setHeader("Content-Type", "text/html");
        res.end(await server.transformIndexHtml("/google-calendar-preview", '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#101827;color:white"><div id="root"></div><script type="module" src="/calendar-preview.jsx"></script></body></html>'));
      });
    },
  }],
});
await server.listen();
console.log("http://127.0.0.1:5190/google-calendar-preview");
