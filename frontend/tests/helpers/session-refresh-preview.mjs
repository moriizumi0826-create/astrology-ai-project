// Real App lifecycle; isolated children/session responses. Never contacts production.
import {createServer} from 'vite';
import config from '../../vite.v3.config.mjs';
const base = config({mode:'development'});
const profile = `import {configureStorage,storeReadingForm} from './reading-storage.js';
let mode='success';let calls=0;
export function scenario(next){mode=next;window.dispatchEvent(new Event('focus'));}
export async function prepareSession(){calls++;const label=document.getElementById('calls');if(label)label.textContent=String(calls);
await new Promise(resolve=>setTimeout(resolve,200));
if(mode==='network')throw new TypeError('Failed to fetch');
if(mode==='503'||mode==='401')throw Object.assign(new Error('HTTP '+mode),{status:Number(mode)});
const session={user_id:'supabase:fixture',state:'paid',access_source:mode==='expiry'?'subscription':'owner',valid_until:new Date(Date.now()+1500).toISOString(),capabilities:{stellar_forecast:true}};
configureStorage(session);storeReadingForm({birth_date:'2000-01-01'});return session;}`;
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {scenario} from '/profile.mjs';import '/app.jsx';
createRoot(document.getElementById('controls')).render(React.createElement('div',null,...['success','network','503','401','expiry'].map(mode=>React.createElement('button',{style:{margin:8},onClick:()=>scenario(mode)},mode)),React.createElement('span',{id:'calls'})));`;
const mocks = {
  'profile.mjs':profile,
  'auth-client.mjs':`export const isMemberMode=()=>false;`,
  'api.mjs':`export const postJson=async()=>({});export const getJson=async()=>({});export const searchBirthLocations=async()=>[];`,
  'account-controls.jsx':`export const AccountControls=()=>null;`,
  'calendar-workspace.jsx':`export const CalendarWorkspace=({children})=>children;export const useCalendarNotes=()=>({openCalendar(){}});`,
  'birth-data-editor.jsx':`export const BirthDataEditor=()=>null;`,
  'horoscope-map.jsx':`export const Horoscope3DMap=()=>null;`,
  'free-horoscope-content.jsx':`import React from 'react';export function FreeHoroscopeContent(){return <section><h1>検証用ワークスペース</h1><textarea aria-label="保持する入力" defaultValue="" /></section>;}`,
  'paid-forecast.jsx':`export default function Paid(){return null;}`,
};
const server=await createServer({...base,configFile:false,server:{...base.server,port:5190,strictPort:true},plugins:[...base.plugins,{
  name:'session-refresh-fixture',enforce:'pre',
  resolveId(id){if(id==='/session-preview.jsx')return '\0session-preview.jsx';},
  load(id){if(id==='\0session-preview.jsx')return entry;const p=id.replaceAll('\\','/');if(p.endsWith('/src/device-time-boundary.jsx'))return 'export const DeviceTimeBoundary=({children})=>children;';if(p.includes('/v3/'))return mocks[p.split('/').pop()];},
  configureServer(server){server.middlewares.use('/session-fixture',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/session-fixture','<!doctype html><html><body style="background:#101827;color:white"><div id="controls" style="position:fixed;bottom:100px;z-index:9999"></div><div id="forecast-detail-root"></div><script type="module" src="/session-preview.jsx"></script></body></html>'));});}
}]});
await server.listen();console.log('http://127.0.0.1:5190/session-fixture#horoscope');
