// Actual daily view + calendar + WebGL map; isolated synthetic API/account only.
import {createServer, transformWithEsbuild} from 'vite';
import {readFile} from 'node:fs/promises';
import config from '../../vite.v3.config.mjs';
const base=config({mode:'development'});
const server=await createServer({...base,configFile:false,server:{...base.server,port:5191,strictPort:true},plugins:[...base.plugins,{
  name:'calendar-map-preview',enforce:'pre',
  resolveId(id){if(id==='/calendar-map-fixture.jsx')return '\0calendar-map-fixture.jsx';},
  async load(id){
    const path=id.replaceAll('\\','/');
    if(path.endsWith('/v3/account-controls.jsx'))return 'export const AccountControls=()=>null;';
    if(path.endsWith('/v3/update-menu.jsx'))return 'export const UpdateMenu=()=>null;';
    if(path.endsWith('/v3/paid-forecast.jsx'))return (await readFile(id,'utf8')).replace('function UnifiedForecastView(', 'export function UnifiedForecastView(');
    if(path.endsWith('/v3/calendar-workspace.jsx'))return 'export const useCalendarNotes=()=>null;export const CalendarNotesDay=()=>null;';
    if(path.endsWith('/v3/reading-storage.js'))return `export const currentLocalDate=()=>new Date().toLocaleDateString('en-CA');export const getStoredReadingForm=()=>({birth_date:'1990-01-01',birth_time:'12:00'});export const getQueryReadingForm=()=>null;export const getStoredReadingResult=()=>null;export const getStoredReadingResultAsync=async()=>null;export const normalizeReadingRequest=x=>x;export const storedMasterVersion=()=>'';export const storeReadingResult=()=>{};`;
    if(path.endsWith('/v3/api.mjs'))return `export const resolveApiBaseUrl=()=>'';export const getQueryReadingForm=()=>null;export const reloadCsvMasters=async()=>({});export const formatApiError=x=>x;export const requestJson=async()=>({});export const getJson=async path=>path.endsWith('/usage')?{unlimited:true}:{};export async function postJson(path,payload){window.fixtureRequests.push({path,payload});document.getElementById('fixture-observation').textContent=JSON.stringify(window.fixtureRequests);if(path.includes('map-assistant'))return {answer:'テスト回答',usage:{unlimited:true}};if(path.includes('transit-charts'))return {charts:payload.target_dates.map(date=>({...window.fixtureChart,date,time:payload.target_time}))};return {...window.fixtureChart,date:payload.target_date,time:payload.target_time,utc_datetime:payload.target_utc_datetime};}`;
    if(id!=='\0calendar-map-fixture.jsx')return;
    const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {UnifiedForecastView} from '/paid-forecast.jsx';import {dashboardData} from '/dashboard-shared.jsx';import {AccessContext} from '/access-context.jsx';import '/tailwind.css';
      window.fixtureRequests=[];const date=new Date().toLocaleDateString('en-CA');const planets=['SUN','MOON','MERCURY','VENUS','MARS','JUPITER','SATURN','URANUS','NEPTUNE','PLUTO'];const points=planets.map((planet,i)=>({planet,longitude:(i*30+5)%360,retrograde:false}));window.fixtureChart={date,time:'12:00',transits:points,house_cusps:Array.from({length:12},(_,i)=>i*30)};
      const day={date,all_aspects:[],transit_chart:window.fixtureChart};const forecast={yearly_data:[day],natal_points:points,natal_house_cusps:window.fixtureChart.house_cusps,house_cusps:window.fixtureChart.house_cusps};const daily={...dashboardData,display_date:date,celestial_event_calendar:[{event_id:'full',event_type:'full_moon',event_date:date,event_datetime:date+'T07:54:13+09:00',title:'満月（テスト）',note:'架空イベント'},{event_id:'noon',event_type:'new_moon',event_date:date,title:'時刻なし（テスト）'}]};
      // Keep one upcoming and one completed event regardless of the test clock.
      const upcomingDate=new Date(Date.now()+86400000).toLocaleDateString('en-CA');const completedDate=new Date(Date.now()-86400000).toLocaleDateString('en-CA');
      Object.assign(daily.celestial_event_calendar[0],{event_date:upcomingDate,event_datetime:upcomingDate+'T07:54:13+09:00'});daily.celestial_event_calendar[1].event_date=completedDate;
      function App(){const [index,setIndex]=React.useState(0);return <AccessContext.Provider value={{session:{state:'paid',access_source:'owner',user_id:'fixture',capabilities:{aspect_list:true,compound_aspects:true,stellar_forecast:true,playback_policy:'paid_existing'}}}}><UnifiedForecastView data={[day]} stats={{}} forecast={forecast} activeYear={2026} dailyDetailData={daily} activeUnifiedView='daily' annualTransitDays={[day]} annualTransitDayIndex={index} setSelectedAnnualDayIndex={setIndex} selectedMonthIndex={0} selectedMonthlyMonthIndex={9} detailLoadingKeys={new Set()} onRequestDayDetail={()=>{}} dailyViewResetKey={0}/></AccessContext.Provider>;}createRoot(document.getElementById('root')).render(<App/>);`;
    return (await transformWithEsbuild(entry,'calendar-map-fixture.jsx',{loader:'jsx'})).code;
  },
  configureServer(server){server.middlewares.use('/calendar-map-preview',async(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/calendar-map-preview','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#101827;color:white"><div id="root"></div><pre id="fixture-observation" style="white-space:pre-wrap"></pre><script type="module" src="/calendar-map-fixture.jsx"></script></body></html>'));});},
}]});
await server.listen();console.log('http://127.0.0.1:5191/calendar-map-preview');
