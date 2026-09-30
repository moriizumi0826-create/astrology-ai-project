// Isolated actual panel: no OpenAI calls, no account or persistent storage.
import {createServer} from 'vite';
import config from '../../vite.v3.config.mjs';
const base=config({mode:'development'});
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {MapAssistantPanel} from '/map-assistant-panel.jsx';import '/tailwind.css';
function App(){const [open,setOpen]=React.useState(false);return React.createElement('main',{style:{position:'relative',height:'95vh'}},React.createElement('button',{onClick:()=>setOpen(true)},'AIに聞く'),React.createElement(MapAssistantPanel,{id:'fixture-chat',open,canAsk:true,context:{date:'2026-09-30'},onClose:()=>setOpen(false)}));}createRoot(document.getElementById('root')).render(React.createElement(App));`;
const server=await createServer({...base,configFile:false,server:{...base.server,port:5191,strictPort:true},plugins:[...base.plugins,{
  name:'chat-retention-fixture',enforce:'pre',
  resolveId(id){if(id==='/chat-preview.jsx')return '\0chat-preview.jsx';},
  load(id){if(id==='\0chat-preview.jsx')return entry;const p=id.replaceAll('\\','/');if(p.endsWith('/v3/calendar-workspace.jsx'))return 'export const useCalendarNotes=()=>null;';if(p.endsWith('/v3/api.mjs'))return 'let calls=0;export async function postJson(path,payload){calls++;await new Promise(resolve=>setTimeout(resolve,1500));return {answer:"検証回答"+calls+" 履歴"+payload.history.length};}';},
  configureServer(server){server.middlewares.use('/chat-fixture',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/chat-fixture','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#101827;color:white"><div id="root"></div><script type="module" src="/chat-preview.jsx"></script></body></html>'));});}
}]});await server.listen();console.log('http://127.0.0.1:5191/chat-fixture');
