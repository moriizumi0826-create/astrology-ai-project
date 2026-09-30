// Isolated UI fixture: actual components, in-memory data, no external calls.
import {createServer} from 'vite';
import config from '../../vite.v3.config.mjs';
const base=config({mode:'development'});
const api=`let notes=[];export const getJson=async()=>({notes:[...notes]});
export const postJson=async()=>({dashboard_data:{}});
export const putJson=async(path,payload)=>{const saved={...payload,id:payload.id||crypto.randomUUID(),revision:(payload.revision||0)+1};notes=[...notes.filter(n=>n.id!==saved.id),saved];return {saved};};
export const deleteJson=async path=>{notes=notes.filter(n=>!path.endsWith(n.id));return {deleted:true};};`;
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import {AccessContext} from '/access-context.jsx';import {CalendarWorkspace,useCalendarNotes} from '/calendar-workspace.jsx';
import {MapAssistantPanel} from '/map-assistant-panel.jsx';import '/tailwind.css';
function Inner(){const ctx=useCalendarNotes();return React.createElement('main',{style:{position:'relative',height:'90vh'}},React.createElement('button',{onClick:ctx.openCalendar},'カレンダーを開く'),React.createElement(MapAssistantPanel,{id:'test',canAsk:ctx.canWrite,context:{date:'2026-09-30'},onClose:()=>{}}));}
function App(){const [paid,setPaid]=React.useState(true);return React.createElement(AccessContext.Provider,{value:{session:{user_id:'fixture',state:paid?'paid':'free',access_source:paid?'owner':'none',capabilities:{stellar_forecast:paid}}}},React.createElement('button',{onClick:()=>setPaid(!paid)},paid?'期限終了に切替':'有料に切替'),React.createElement(CalendarWorkspace,null,React.createElement(Inner)));}createRoot(document.getElementById('root')).render(React.createElement(App));`;
const server=await createServer({...base,configFile:false,server:{...base.server,port:5189,strictPort:true},plugins:[...base.plugins,{
  name:'calendar-notes-fixture',enforce:'pre',
  resolveId(id){if(id==='/calendar-preview.jsx')return '\0notes-fixture.jsx';},
  load(id){if(id==='\0notes-fixture.jsx')return entry;if(id.replaceAll('\\','/').endsWith('/v3/api.mjs'))return api;},
  configureServer(server){server.middlewares.use('/notes-fixture',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/notes-fixture','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#101827;color:white"><div id="root"></div><script type="module" src="/calendar-preview.jsx"></script></body></html>'));});}
}]});
await server.listen();console.log('http://127.0.0.1:5189/notes-fixture');
