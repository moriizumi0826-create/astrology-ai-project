// Isolated real-component UI checks; synthetic charts and no external API requests.
import {createServer,transformWithEsbuild} from 'vite';
import {readFile} from 'node:fs/promises';
import config from '../../vite.v3.config.mjs';
const base=config({mode:'development'});
const server=await createServer({...base,configFile:false,server:{...base.server,port:5195,strictPort:true},plugins:[...base.plugins,{
  name:'free-access-fixture',enforce:'pre',
  resolveId(id){if(id==='/access-preview.jsx')return '\0free-access-fixture.jsx';},
  async load(id){
    const path=id.replaceAll('\\','/');
    if(path.endsWith('/v3/app.jsx'))return (await readFile(id,'utf8')).replace('function Horoscope(', 'export function Horoscope(').split('const root = import.meta.hot')[0];
    if(path.endsWith('/v3/paid-forecast.jsx'))return (await readFile(id,'utf8')).replace('function OraclePanel(', 'export function OraclePanel(');
    if(path.endsWith('/v3/account-controls.jsx'))return 'export const AccountControls=()=>null;';
    if(path.endsWith('/v3/update-menu.jsx'))return 'export const UpdateMenu=()=>null;';
    if(path.endsWith('/v3/free-horoscope-content.jsx'))return `import React from 'react';export const FreeHoroscopeContent=({belowMetaContent})=><section aria-label="Horoscopeコンテンツ"><h1>Horoscope</h1>{belowMetaContent}</section>;`;
    if(path.endsWith('/v3/birth-data-editor.jsx'))return 'export const BirthDataEditor=()=>null;';
    if(path.endsWith('/v3/reading-storage.js'))return `const data={reading_date:'2026-10-12',meta:{name:'検証用'},natal_points:[{planet:'SUN',longitude:150},{planet:'MOON',longitude:120}],natal_house_cusps:Array.from({length:12},(_,i)=>i*30)};export const RESULT_STORAGE_KEY='fixture-result',FORM_STORAGE_KEY='fixture-form',configureStorage=()=>{},storageOwner=()=>'',freeResult=x=>x||data,getStoredReadingForm=()=>({birth_date:'2000-01-01',birth_time:'12:00'}),getStoredReadingResult=()=>data,getStoredReadingResultAsync=async()=>data,storeReadingForm=()=>{},storeReadingResult=async()=>{},currentLocalDate=()=>"2026-10-12",clearReadingResult=()=>{},isStoredResultFresh=()=>true,storedMasterVersion=()=>'',normalizeReadingRequest=x=>x;`;
    if(path.endsWith('/v3/calendar-workspace.jsx'))return 'export const CalendarWorkspace=({children})=>children;export const useCalendarNotes=()=>({notes:[],loaded:true,openCalendar:()=>{}});export const CalendarNotesDay=()=>null;';
    if(path.endsWith('/v3/api.mjs'))return `export const apiPath=x=>x,getJson=async()=>({limit:20,remaining:20}),postJson=async()=>({}),putJson=async()=>({}),deleteJson=async()=>({}),requestJson=async()=>({ok:true,data:{}}),formatApiError=()=>'',resolveApiBaseUrl=()=>'',getQueryReadingForm=()=>null,searchBirthLocations=async()=>[],reloadCsvMasters=async()=>{};`;
    if(id==='\0free-access-fixture.jsx')return (await transformWithEsbuild(`
      import React from 'react';import {createRoot} from 'react-dom/client';import {Horoscope} from '/app.jsx';import {OraclePanel} from '/paid-forecast.jsx';import {AccessContext} from '/access-context.jsx';import '/tailwind.css';
      const params=new URLSearchParams(location.search),paid=params.get('plan')==='paid';
      const session={user_id:'fixture',state:paid?'paid':'free',access_source:paid?'owner':'none',capabilities:{aspect_list:true,compound_aspects:paid,stellar_forecast:paid,playback_policy:paid?'paid_existing':'today_plus_minus_30'}};
      createRoot(document.getElementById('root')).render(<AccessContext.Provider value={{session}}>{params.get('screen')==='annual'?<OraclePanel stats={{}} forecast={{}}/>:<Horoscope session={session} onForecast={()=>{}}/>}</AccessContext.Provider>);
    `,'fixture.jsx',{loader:'jsx'})).code;
  },
  configureServer(server){server.middlewares.use('/free-access-fixture',async(_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await server.transformIndexHtml('/free-access-fixture','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#101827;color:white"><div id="root"></div><script type="module" src="/access-preview.jsx"></script></body></html>'));});}
}]});await server.listen();console.log('http://127.0.0.1:5195/free-access-fixture');
