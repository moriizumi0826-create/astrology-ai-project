// Isolated paid/free display check; no production or ephemeris requests.
import {createServer} from 'vite';
import config from '../../vite.v3.config.mjs';
const base=config({mode:'development'});
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {AccessContext} from '/access-context.jsx';import {MapAspectDescription} from '/map-aspect-description.jsx';import '/tailwind.css';
function App(){const [paid,setPaid]=React.useState(true);return React.createElement(AccessContext.Provider,{value:{session:{user_id:'fixture',state:paid?'paid':'free',access_source:paid?'owner':'none'}}},React.createElement('button',{onClick:()=>setPaid(!paid)},paid?'無料に切替':'有料に切替'),React.createElement('p',null,React.createElement(MapAspectDescription,{aspect:{scope:'transitNatal',transitPlanet:'SATURN',natalPlanet:'SUN',angle:90,description:'無料の代表解釈文'},house:5,retrograde:true})));}createRoot(document.getElementById('root')).render(React.createElement(App));`;
const server=await createServer({...base,configFile:false,server:{...base.server,port:5192,strictPort:true},plugins:[...base.plugins,{
  name:'aspect-detail-fixture',enforce:'pre',resolveId(id){if(id==='/aspect-preview.jsx')return '\0aspect-preview.jsx';},
  load(id){if(id==='\0aspect-preview.jsx')return entry;if(id.replaceAll('\\','/').endsWith('/v3/api.mjs'))return 'export const postJson=async(path,payload)=>({description:"Text_Descriptionの個別詳細："+payload.transit_planet+" × "+payload.natal_planet+" / "+payload.natal_house+"ハウス / 逆行="+payload.retrograde});';},
  configureServer(server){server.middlewares.use('/aspect-fixture',async(req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/aspect-fixture','<!doctype html><html><body style="background:#101827;color:white"><div id="root"></div><script type="module" src="/aspect-preview.jsx"></script></body></html>'));});}
}]});await server.listen();console.log('http://127.0.0.1:5192/aspect-fixture');
