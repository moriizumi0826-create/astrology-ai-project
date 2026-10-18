// Real map and generated symbol textures, synthetic data, no external API access.
import {createServer,transformWithEsbuild} from 'vite';
import {readFile} from 'node:fs/promises';
import config from '../../vite.v3.config.mjs';
const base=config({mode:'development'});
const server=await createServer({...base,configFile:false,server:{...base.server,port:5196,strictPort:true},plugins:[...base.plugins,{
 name:'retrograde-fixture',enforce:'pre',resolveId(id){if(id==='/motion-preview.jsx')return '\0motion-preview.jsx';},
 async load(id){const path=id.replaceAll('\\','/');
  if(path.endsWith('/v3/horoscope-map.jsx'))return await readFile(id,'utf8')+'\nexport {planetSymbolTexture,planetSymbolOutlineTexture,interpolatedTransitChart,setTransitVisualsFromCharts};';
  if(path.endsWith('/v3/calendar-workspace.jsx'))return 'export const useCalendarNotes=()=>null;';
  if(path.endsWith('/v3/api.mjs'))return `export const getJson=async()=>({}),postJson=async()=>({}),requestJson=async()=>({ok:true,data:{}}),formatApiError=()=>'',resolveApiBaseUrl=()=>'',getQueryReadingForm=()=>null;`;
  if(id==='\0motion-preview.jsx')return (await transformWithEsbuild(`
    import React from 'react';import {createRoot} from 'react-dom/client';import * as map from '/horoscope-map.jsx';import {AccessContext} from '/access-context.jsx';import '/tailwind.css';
    window.motionTest=map;
    const direct=new URLSearchParams(location.search).has('direct');
    const chart={date:'2026-10-18',time:'12:00',transits:[{planet:'MERCURY',longitude:150,retrograde:!direct},{planet:'VENUS',longitude:210,retrograde:false},{planet:'SATURN',longitude:330,retrograde:!direct}],house_cusps:Array.from({length:12},(_,i)=>i*30)};
    createRoot(document.getElementById('root')).render(<AccessContext.Provider value={{session:{state:'paid',access_source:'owner',user_id:'fixture',capabilities:{aspect_list:true,compound_aspects:true}}}}><map.TransitNatalSunMap day={{date:chart.date,transit_chart:chart,all_aspects:[]}} forecast={{natal_points:[{planet:'SUN',longitude:150},{planet:'MERCURY',longitude:210,retrograde:!direct}],natal_house_cusps:chart.house_cusps}}/></AccessContext.Provider>);
  `,'fixture.jsx',{loader:'jsx'})).code;
 },
 configureServer(server){server.middlewares.use('/motion-fixture',async(_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await server.transformIndexHtml('/motion-fixture','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#101827;color:white"><div id="root"></div><script type="module" src="/motion-preview.jsx"></script></body></html>'));});}
}]});await server.listen();console.log('http://127.0.0.1:5196/motion-fixture');
