// Actual daily graph with synthetic fallback scores; no production/API access.
import {createServer,transformWithEsbuild} from 'vite';
import {readFile} from 'node:fs/promises';
import config from '../../vite.v3.config.mjs';
const base=config({mode:'development'});
const server=await createServer({...base,configFile:false,server:{...base.server,port:5197,strictPort:true},plugins:[...base.plugins,{
 name:'daily-tooltip-fixture',enforce:'pre',resolveId(id){if(id==='/daily-score-fixture.jsx')return '\0daily-score-fixture.jsx';},
 async load(id){const path=id.replaceAll('\\','/');
  if(path.endsWith('/v3/dashboard-shared.jsx'))return await readFile(id,'utf8')+'\nexport {DashboardV2DailyFlowCard};';
  if(path.endsWith('/v3/calendar-workspace.jsx'))return 'export const useCalendarNotes=()=>null;export const CalendarNotesDay=()=>null;';
  if(path.endsWith('/v3/api.mjs'))return 'export const postJson=async()=>({});';
  if(id==='\0daily-score-fixture.jsx')return (await transformWithEsbuild(`import React from 'react';import {createRoot} from 'react-dom/client';import {DashboardV2DailyFlowCard} from '/dashboard-shared.jsx';import '/tailwind.css';createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-4xl p-3"><DashboardV2DailyFlowCard data={{display_date:'2026-10-18'}}/></main>);`,'fixture.jsx',{loader:'jsx'})).code;
 },
 configureServer(server){server.middlewares.use('/daily-tooltip-preview',async(_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await server.transformIndexHtml('/daily-tooltip-preview','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#101827;color:white"><div id="root"></div><script type="module" src="/daily-score-fixture.jsx"></script></body></html>'));});}
}]});await server.listen();console.log('http://127.0.0.1:5197/daily-tooltip-preview');
