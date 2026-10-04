// Real map component, isolated from accounts and external APIs.
import { createServer } from 'vite';
import config from '../../vite.v3.config.mjs';
const base = config({ mode: 'development' });
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import {Horoscope3DMap} from '/horoscope-map.jsx';import {AccessContext} from '/access-context.jsx';import '/tailwind.css';
const data={reading_date:'2026-10-01',natal_points:[{planet:'SUN',longitude:150},{planet:'MOON',longitude:120}],natal_house_cusps:Array.from({length:12},(_,i)=>i*30)};
createRoot(document.getElementById('root')).render(React.createElement(AccessContext.Provider,{value:{session:{user_id:'fixture',state:'paid',access_source:'owner'}}},React.createElement(Horoscope3DMap,{data})));`;
const server = await createServer({ ...base, configFile: false,
  server: { ...base.server, port: 5193, strictPort: true },
  plugins: [...base.plugins, { name: 'map-settings-fixture', enforce: 'pre',
    resolveId(id) { if (id === '/map-preview.jsx') return '\0map-preview.jsx'; },
    load(id) {
      if (id === '\0map-preview.jsx') return entry;
      const path = id.replaceAll('\\', '/');
      if (path.endsWith('/v3/calendar-workspace.jsx')) return 'export const useCalendarNotes=()=>null;';
      if (path.endsWith('/v3/api.mjs')) return `export const getJson=async()=>({limit:20,remaining:20,reset_at:new Date(Date.now()+86400000).toISOString()}),postJson=async()=>({}),requestJson=async()=>({ok:true,data:{}}),formatApiError=()=>'',resolveApiBaseUrl=()=>'',getQueryReadingForm=()=>null;`;
    },
    configureServer(server) { server.middlewares.use('/settings-fixture', async (_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(await server.transformIndexHtml('/settings-fixture', '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#101827"><div id="root"></div><script type="module" src="/map-preview.jsx"></script></body></html>'));
    }); }
  }]
});
await server.listen();console.log('http://127.0.0.1:5193/settings-fixture');
