import {createServer,transformWithEsbuild} from 'vite';
import {readFile} from 'node:fs/promises';
import config from '../../vite.v3.config.mjs';
const base=config({mode:'development'});
const server=await createServer({...base,configFile:false,server:{...base.server,port:5198,strictPort:true},plugins:[...base.plugins,{
 name:'retrograde-calendar-fixture',enforce:'pre',resolveId(id){if(id==='/retro-calendar-fixture.jsx')return '\0retro-calendar-fixture.jsx';},
 async load(id){const path=id.replaceAll('\\','/');
  if(path.endsWith('/v3/paid-forecast.jsx'))return await readFile(id,'utf8')+'\nexport {Header};';
  if(path.endsWith('/v3/account-controls.jsx'))return 'export const AccountControls=()=>null;';
  if(path.endsWith('/v3/update-menu.jsx'))return 'export const UpdateMenu=()=>null;';
  if(path.endsWith('/v3/horoscope-map.jsx'))return 'export const Horoscope3DMap=()=>null;export const TransitNatalSunMap=()=>null;';
  if(path.endsWith('/v3/calendar-workspace.jsx'))return 'export const CalendarNotesDay=()=>null;export const useCalendarNotes=()=>null;';
  if(path.endsWith('/v3/api.mjs'))return `export const getJson=async()=>{window.calendarLoads=(window.calendarLoads||0)+1;return {events:[{planet:'MERCURY',planet_label:'水星',event_type:'RETROGRADE_START',event_date:'2026-01-01'},{planet:'SATURN',planet_label:'土星',event_type:'DIRECT_START',event_date:'2030-12-01'}]};},postJson=async()=>({}),requestJson=async()=>({}),formatApiError=()=>'',resolveApiBaseUrl=()=>'',getQueryReadingForm=()=>null,reloadCsvMasters=async()=>{};`;
  if(id==='\0retro-calendar-fixture.jsx')return (await transformWithEsbuild(`import React from 'react';import {createRoot} from 'react-dom/client';import {Header} from '/paid-forecast.jsx';import '/tailwind.css';createRoot(document.getElementById('root')).render(<Header activeView="unified" setActiveView={()=>{}} dashboardData={{retrogradeCalendar:[{planet_label:'土星',event_date:'2030-12-01'}]}}/>);`,'fixture.jsx',{loader:'jsx'})).code;
 },
 configureServer(server){server.middlewares.use('/retro-calendar-preview',async(_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await server.transformIndexHtml('/retro-calendar-preview','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#101827;color:white"><div id="root"></div><script type="module" src="/retro-calendar-fixture.jsx"></script></body></html>'));});}
}]});await server.listen();console.log('http://127.0.0.1:5198/retro-calendar-preview');
