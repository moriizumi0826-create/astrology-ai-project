// Real countdown UI with synthetic events only; no external API calls.
import {createServer,transformWithEsbuild} from 'vite';
import config from '../../vite.v3.config.mjs';
const base=config({mode:'development'});
const server=await createServer({...base,configFile:false,server:{...base.server,port:5194,strictPort:true},plugins:[...base.plugins,{
  name:'stellar-event-info-preview',enforce:'pre',
  resolveId(id){if(id==='/stellar-info-fixture.jsx')return '\0stellar-info-fixture.jsx';},
  async load(id){
    if(id.replaceAll('\\','/').endsWith('/v3/calendar-workspace.jsx'))return 'export const useCalendarNotes=()=>null;export const CalendarNotesDay=()=>null;';
    if(id!=='\0stellar-info-fixture.jsx')return;
    return (await transformWithEsbuild(`import React from 'react';import {createRoot} from 'react-dom/client';import {DashboardV2CountdownCard} from '/dashboard-shared.jsx';import '/tailwind.css';
      const date=new Date().toLocaleDateString('en-CA');const past=new Date(Date.now()-86400000).toLocaleDateString('en-CA');const common={event_date:date,event_datetime:date+'T23:59:00',hours_remaining:3};
      const events=[{...common,event_id:'house',event_type:'natal_house_ingress',planet:'MOON',house:6,title:'月がネイタル第6ハウスへ移動',note:'テスト用のイベントです。'},{...common,event_id:'aspect',event_type:'transit_natal_aspect',planet:'MARS',natal_planet:'SUN',aspect_angle:120,title:'火星と出生図の太陽が120°'},{...common,event_id:'full',event_type:'full_moon',title:'満月'},{event_id:'past',event_date:past,event_datetime:past+'T12:00:00',event_type:'sign_ingress',planet:'VENUS',sign:'天秤座',title:'金星が天秤座へ移動'}];
      createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-lg space-y-5 p-4"><DashboardV2CountdownCard data={{display_date:date,celestial_event_calendar:events}}/></main>);`,'stellar-info-fixture.jsx',{loader:'jsx'})).code;
  },
  configureServer(server){server.middlewares.use('/stellar-info-preview',async(_req,res)=>{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/stellar-info-preview','<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#101827;color:white"><div id="root"></div><script type="module" src="/stellar-info-fixture.jsx"></script></body></html>'));});},
}]});
await server.listen();console.log('http://127.0.0.1:5194/stellar-info-preview');
