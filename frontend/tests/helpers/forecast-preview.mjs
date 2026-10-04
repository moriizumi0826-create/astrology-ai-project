// First run from repo root: python -m frontend.tests.helpers.generate-forecast-preview
// Then from frontend: node tests/helpers/forecast-preview.mjs
// sample-daily renders actual paid cards; free-preview tests real Workspace with stub accounts/API.
import {createServer, transformWithEsbuild} from 'vite';
import {readFile} from 'node:fs/promises';
import config from '../../vite.v3.config.mjs';
const base=config({mode:'development'});
const sample=JSON.parse(await readFile('../artifacts/forecast-preview-sample.json','utf8'));
const server=await createServer({...base,configFile:false,server:{...base.server,port:5192,strictPort:true},plugins:[...base.plugins,{
  name:'forecast-preview-fixture',enforce:'pre',
  resolveId(id){if(id==='/forecast-preview-fixture.jsx')return '\0forecast-preview-fixture.jsx';if(id==='/free-forecast-fixture.jsx')return '\0free-forecast-fixture.jsx';},
  async load(id){
    const path=id.replaceAll('\\','/');
    if(path.endsWith('/v3/app.jsx'))return (await readFile(id,'utf8')).replace('function Workspace(', 'export function Workspace(').split('const root = import.meta.hot')[0];
    if(path.endsWith('/v3/account-controls.jsx'))return 'export const AccountControls=()=>null;';
    if(path.endsWith('/v3/update-menu.jsx'))return 'export const UpdateMenu=()=>null;';
    if(path.endsWith('/v3/horoscope-map.jsx'))return 'export const Horoscope3DMap=()=>null;';
    if(path.endsWith('/v3/free-horoscope-content.jsx'))return `import React from 'react';export const FreeHoroscopeContent=({belowMetaContent})=><section aria-label="Horoscopeコンテンツ"><h1>Horoscope</h1>{belowMetaContent}</section>;`;
    if(path.endsWith('/v3/birth-data-editor.jsx'))return 'export const BirthDataEditor=()=>null;';
    if(path.endsWith('/src/device-time-boundary.jsx'))return 'export const DeviceTimeBoundary=({children})=>children;';
    if(path.endsWith('/v3/profile.mjs'))return 'export const prepareSession=async()=>({});export const finishMemberLogin=async()=>{};';
    if(path.endsWith('/v3/auth-client.mjs'))return `export const initializeAuth=async()=>({mode:'supabase'});export const authClient=async()=>({auth:{getUser:async()=>({data:{user:null}})}});export const authMessage=x=>String(x);export const isMemberMode=()=>true;`;
    if(path.endsWith('/v3/captcha.mjs'))return 'export const initializeCaptcha=async()=>{};export const captchaTokenForRequest=()=>null;export const resetCaptcha=()=>{};';
    if(path.endsWith('/v3/paid-forecast.jsx'))return `export default function PaidForecast(){return "有料画面（テスト）";}`;
    if(path.endsWith('/v3/api.mjs'))return `export const resolveApiBaseUrl=()=>'';export const getJson=async()=>({});export const searchBirthLocations=async()=>[];export async function postJson(path){const el=document.getElementById('requests');el.textContent=String(Number(el.textContent)+1);return {dashboard_data:{}};}`;
    if(path.endsWith('/v3/reading-storage.js'))return `export const currentLocalDate=()=>"2026-10-04";export const configureStorage=()=>{};export const storageOwner=()=>'';export const freeResult=x=>x||{meta:{},dashboard_data:{}};export const getStoredReadingForm=()=>({});export const getQueryReadingForm=()=>null;export const getStoredReadingResult=()=>null;export const getStoredReadingResultAsync=async()=>null;export const normalizeReadingRequest=x=>x;export const storedMasterVersion=()=>'';export const storeReadingResult=()=>{};`;
    if(path.endsWith('/v3/calendar-workspace.jsx'))return 'export const CalendarWorkspace=({children})=>children;export const useCalendarNotes=()=>({openCalendar:()=>{}});export const CalendarNotesDay=()=>null;';
    if(id==='\0free-forecast-fixture.jsx')return (await transformWithEsbuild(`import React from 'react';import {createRoot} from 'react-dom/client';import {Workspace} from '/app.jsx';import '/tailwind.css';const mode=new URLSearchParams(location.search).get('account');const session=mode==='paid'?{state:'paid',access_source:'owner',user_id:'fixture',capabilities:{stellar_forecast:true}}:{state:'free',user_id:mode==='free'?'fixture':null};createRoot(document.getElementById('root')).render(<Workspace session={session}/>);`,'fixture.jsx',{loader:'jsx'})).code;
    if(id!=='\0forecast-preview-fixture.jsx')return;
    const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {DashboardDailyDetailContentLayer,dashboardData} from '/dashboard-shared.jsx';import '/tailwind.css';createRoot(document.getElementById('root')).render(<main style={{padding:16,maxWidth:1400,margin:'auto'}}><DashboardDailyDetailContentLayer data={{...dashboardData,...${JSON.stringify(sample)}}}/></main>);`;
    return (await transformWithEsbuild(entry,'fixture.jsx',{loader:'jsx'})).code;
  },
  configureServer(server){for(const [route,entry] of [['/sample-daily','forecast-preview-fixture'],['/free-preview','free-forecast-fixture']])server.middlewares.use(route,async(_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await server.transformIndexHtml(route,`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#101827;color:white"><div id="root"></div><output id="requests" aria-label="API呼び出し回数">0</output><script type="module" src="/${entry}.jsx"></script></body></html>`));});},
}]});
await server.listen();console.log('http://127.0.0.1:5192/sample-daily');
