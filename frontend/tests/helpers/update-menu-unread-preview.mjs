// Isolated unread UI fixture: actual UpdateMenu, no auth/API requests or paid AI usage.
import {createServer, transformWithEsbuild} from 'vite';
import {readFile} from 'node:fs/promises';
import config from '../../vite.v3.config.mjs';
const base=config({mode:'development'});
const server=await createServer({...base,configFile:false,server:{...base.server,port:5193,strictPort:true},plugins:[...base.plugins,{
  name:'update-menu-fixture',enforce:'pre',
  resolveId(id){if(id==='/update-menu-fixture.jsx')return '\0update-menu-fixture.jsx';},
  async load(id){
    if(id.replaceAll('\\','/').endsWith('/v3/update-content.mjs') && process.env.UPDATE_FIXTURE_NEWS==='true') {
      return (await readFile(id,'utf8')).replace('export const announcements = [];','export const announcements = [{date:"2026-10-04",title:"テスト用のお知らせ",body:"未読状態の確認用（本番には追加されません）"}];');
    }
    if(id!=='\0update-menu-fixture.jsx')return;
    return (await transformWithEsbuild(`import React from 'react';import {createRoot} from 'react-dom/client';import {UpdateMenu} from '/update-menu.jsx';import '/tailwind.css';const old=new URLSearchParams(location.search).has('outdated');createRoot(document.getElementById('root')).render(<header className="flex justify-end gap-3 p-4"><UpdateMenu versionState={{isAppOutdated:old}}/><UpdateMenu versionState={{isAppOutdated:old}}/></header>);`,'fixture.jsx',{loader:'jsx'})).code;
  },
  configureServer(server){server.middlewares.use('/update-menu-test',async(_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await server.transformIndexHtml('/update-menu-test',`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/update-menu-fixture.jsx"></script></body></html>`));});},
}]});
await server.listen();console.log('http://127.0.0.1:5193/update-menu-test');
