// Local UI verification only. No real API calls or account changes.
import { createServer } from "vite";
import config from "../../vite.v3.config.mjs";
const base=config({mode:"development"});
const server=await createServer({...base,configFile:false,
  server:{...base.server,port:5189,strictPort:true},
  plugins:[...base.plugins,{
    name:"map-assistant-fixture",enforce:"pre",
    load(id){const path=id.replaceAll("\\","/");if(path.endsWith('/v3/calendar-workspace.jsx'))return 'export const useCalendarNotes=()=>null;';if(path.endsWith("/v3/api.mjs"))return `export async function getJson(){return {limit:20,remaining:20-window.fixtureCalls,reset_at:new Date(Date.now()+86400000).toISOString()};}export async function postJson(){document.querySelector('#calls').textContent=String(++window.fixtureCalls);return {answer:'テスト用API回答',mode:'openai',usage:await getJson()};}`;},
    configureServer(server){server.middlewares.use('/assistant-fixture',async(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/assistant-fixture',`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#101827;color:white"><div id="root"></div><script type="module" src="/fixture.jsx"></script></body></html>`));});},
    resolveId(id){if(id==='/fixture.jsx')return '\0fixture.jsx';},
    transform(_code,id){if(id==='\0fixture.jsx')return null;},
  },{
    name:'fixture-entry',
    load(id){if(id==='\0fixture.jsx')return `import React from 'react';
import {createRoot} from 'react-dom/client';import {MapAssistantPanel} from '/map-assistant-panel.jsx';import '/tailwind.css';
window.fixtureCalls=0;
function App(){const [paid,setPaid]=React.useState(false);return React.createElement('main',{style:{position:'relative',height:'95vh'}},React.createElement('button',{onClick:()=>setPaid(!paid)},paid?'無料に切替':'有料に切替'),React.createElement('div',{id:'calls'},'0'),React.createElement(MapAssistantPanel,{id:'test',canAsk:paid,context:{},onClose:()=>{}}));}createRoot(document.getElementById('root')).render(React.createElement(App));`;}
  }]
});
await server.listen();console.log('http://127.0.0.1:5189/assistant-fixture');
