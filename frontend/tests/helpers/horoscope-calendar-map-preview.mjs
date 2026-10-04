// Actual Horoscope/calendar/map, synthetic account and API. No external calls.
import {createServer, transformWithEsbuild} from 'vite';
import {readFile} from 'node:fs/promises';
import config from '../../vite.v3.config.mjs';
const base=config({mode:'development'});
const server=await createServer({...base,configFile:false,server:{...base.server,port:5192,strictPort:true},plugins:[...base.plugins,{
  name:'horoscope-calendar-map-preview',enforce:'pre',
  resolveId(id){if(id==='/horoscope-calendar-fixture.jsx')return '\0horoscope-calendar-fixture.jsx';},
  async load(id){
    const path=id.replaceAll('\\','/');
    if(path.endsWith('/v3/account-controls.jsx'))return 'export const AccountControls=()=>null;';
    if(path.endsWith('/v3/update-menu.jsx'))return 'export const UpdateMenu=()=>null;';
    if(path.endsWith('/src/device-time-boundary.jsx'))return 'export const DeviceTimeBoundary=({children})=>children;';
    if(path.endsWith('/v3/profile.mjs'))return 'export const prepareSession=async()=>({});';
    if(path.endsWith('/v3/app.jsx'))return (await readFile(id,'utf8')).replace('function Horoscope(', 'export function Horoscope(').split('const root = import.meta.hot')[0];
    if(path.endsWith('/v3/reading-storage.js'))return `export const currentLocalDate=()=>new Date().toLocaleDateString('en-CA');export const getStoredReadingForm=()=>({birth_date:'1990-01-01',birth_time:'12:00'});export const getQueryReadingForm=()=>null;export const getStoredReadingResult=()=>window.fixtureData;export const getStoredReadingResultAsync=async()=>window.fixtureData;export const normalizeReadingRequest=x=>x;export const storedMasterVersion=()=>'';export const storeReadingResult=()=>{};export const configureStorage=()=>{};export const storageOwner=()=>'';export const freeResult=x=>x;`;
    if(path.endsWith('/v3/api.mjs'))return `export const getQueryReadingForm=()=>null;export const resolveApiBaseUrl=()=>'';export const reloadCsvMasters=async()=>({});export const formatApiError=x=>x;export const requestJson=async()=>({});export const searchBirthLocations=async()=>[];export const putJson=async()=>({});export const deleteJson=async()=>({});export const getJson=async path=>path.endsWith('/usage')?{unlimited:true}:{notes:[]};export async function postJson(path,payload){window.fixtureRequests.push({path,payload});document.getElementById('fixture-observation').textContent=JSON.stringify(window.fixtureRequests);if(path==='/api/readings/deferred')return {dashboard_data:window.fixtureDaily};if(path.includes('map-assistant'))return {answer:'テスト回答',usage:{unlimited:true}};if(path.includes('transit-charts'))return {charts:payload.target_dates.map(date=>({...window.fixtureChart,date,time:payload.target_time}))};return {...window.fixtureChart,date:payload.target_date,time:payload.target_time,utc_datetime:payload.target_utc_datetime};}`;
    if(id!=='\0horoscope-calendar-fixture.jsx')return;
    const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {Horoscope} from '/app.jsx';import {CalendarWorkspace} from '/calendar-workspace.jsx';import {dashboardData} from '/dashboard-shared.jsx';import {AccessContext} from '/access-context.jsx';import '/tailwind.css';
      window.fixtureRequests=[];const date=new Date().toLocaleDateString('en-CA');const points=['SUN','MOON','MERCURY','VENUS','MARS','JUPITER','SATURN','URANUS','NEPTUNE','PLUTO'].map((planet,i)=>({planet,longitude:i*30+5,retrograde:false}));window.fixtureChart={date,time:'12:00',transits:points,house_cusps:Array.from({length:12},(_,i)=>i*30)};
      window.fixtureDaily={...dashboardData,display_date:date,celestial_event_calendar:[{event_id:'full',event_type:'full_moon',event_date:date,event_datetime:date+'T07:54:13+09:00',title:'満月（テスト）',note:'架空イベント'}]};window.fixtureData={reading_date:date,natal_points:points,natal_house_cusps:window.fixtureChart.house_cusps,dashboard_data:window.fixtureDaily};
      const session={state:'paid',access_source:'owner',user_id:'fixture',capabilities:{aspect_list:true,compound_aspects:true,stellar_forecast:true,playback_policy:'paid_existing'}};createRoot(document.getElementById('root')).render(<AccessContext.Provider value={{session}}><CalendarWorkspace><Horoscope session={session} onForecast={()=>{}}/></CalendarWorkspace></AccessContext.Provider>);`;
    return (await transformWithEsbuild(entry,'horoscope-calendar-fixture.jsx',{loader:'jsx'})).code;
  },
  configureServer(server){server.middlewares.use('/horoscope-calendar-preview',async(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/horoscope-calendar-preview','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#101827;color:white"><div id="root"></div><pre id="fixture-observation" style="white-space:pre-wrap"></pre><script type="module" src="/horoscope-calendar-fixture.jsx"></script></body></html>'));});},
}]});
await server.listen();console.log('http://127.0.0.1:5192/horoscope-calendar-preview');
