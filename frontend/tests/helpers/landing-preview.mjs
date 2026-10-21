// Actual LP + map components with synthetic data and mocked auth/API only.
import { createServer, transformWithEsbuild } from 'vite';
import config from '../../vite.v3.config.mjs';
const base = config({ mode: 'development' });
const server = await createServer({ ...base, configFile: false,
  server: { ...base.server, port: 5197, strictPort: true },
  plugins: [...base.plugins, {
    name: 'landing-preview', enforce: 'pre',
    resolveId(id) { if (id === '/landing-map.jsx') return '\0landing-map.jsx'; },
    async load(id) {
      const filename = id.replaceAll('\\', '/');
      if (filename.endsWith('/v3/profile.mjs')) return 'export const prepareSession=async()=>({state:"anonymous"});export const saveMemberProfile=async()=>{};';
      if (filename.endsWith('/v3/calendar-workspace.jsx')) return 'export const useCalendarNotes=()=>null;';
      if (filename.endsWith('/v3/api.mjs')) return `export const getJson=async()=>({}),postJson=async()=>({}),requestJson=async()=>({ok:true,data:{}}),formatApiError=()=>'',resolveApiBaseUrl=()=>'',getQueryReadingForm=()=>null;`;
      if (id !== '\0landing-map.jsx') return;
      return (await transformWithEsbuild(`
        import React from 'react';import {createRoot} from 'react-dom/client';
        import {TransitNatalSunMap} from '/horoscope-map.jsx';import {AccessContext} from '/access-context.jsx';import '/tailwind.css';
        const planets=['SUN','MOON','MERCURY','VENUS','MARS','JUPITER','SATURN','URANUS','NEPTUNE','PLUTO'];
        const natal=planets.map((planet,i)=>({planet,longitude:[150,78,168,120,204,296,324,250,281,225][i],retrograde:false}));
        const transits=planets.map((planet,i)=>({planet,longitude:[208,328,231,218,125,116,9,64,0,303][i],retrograde:[2,3,6,7,8,9].includes(i)}));
        const cusps=Array.from({length:12},(_,i)=>(i*30+10)%360);
        const chart={date:'2026-10-21',time:'12:00',transits,house_cusps:cusps};
        const session={state:'paid',access_source:'owner',user_id:'fixture',capabilities:{aspect_list:true,compound_aspects:true}};
        createRoot(document.getElementById('root')).render(<AccessContext.Provider value={{session}}><TransitNatalSunMap day={{date:chart.date,transit_chart:chart,all_aspects:[]}} forecast={{natal_points:natal,natal_house_cusps:cusps}}/></AccessContext.Provider>);
      `, 'landing-map.jsx', { loader: 'jsx' })).code;
    },
    configureServer(server) { server.middlewares.use('/landing-map-preview', async (_req, res) => {
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(await server.transformIndexHtml('/landing-map-preview','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#101827;color:white;margin:0"><main id="root" style="width:1000px;margin:0 auto"></main><script type="module" src="/landing-map.jsx"></script></body></html>'));
    }); },
  }],
});
await server.listen();console.log('http://127.0.0.1:5197/entry.html');
