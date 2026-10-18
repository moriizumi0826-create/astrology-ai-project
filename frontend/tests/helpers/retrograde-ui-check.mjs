import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/morii/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 for(const width of [390,1280]) {
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const direct of [false,true]) {
   await page.goto('http://127.0.0.1:5196/motion-fixture'+(direct?'?direct':''));
   await page.getByText('R＝逆行',{exact:true}).waitFor();
   const textureCheck=await page.evaluate(()=>{
    const m=window.motionTest;
    const orange=texture=>{const pixels=texture.image.getContext('2d').getImageData(125,5,50,50).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>200&&pixels[i+1]>90&&pixels[i+1]<210&&pixels[i+2]<160&&pixels[i+3]>150)count++;texture.dispose();return count;};
    const from={transits:[{planet:'MERCURY',longitude:150,retrograde:true}]},to={transits:[{planet:'MERCURY',longitude:151,retrograde:false}]};
    const visual={baseY:0,objects:[],symbolSprite:{material:{}},symbolTextures:{direct:'D',retrograde:'R'}};
    const state={transitVisuals:new Map([['MERCURY',visual]]),transitPositions:new Map(),aspectGroup:{children:[]}};
    const spriteMotion=[0,1].map(p=>{m.setTransitVisualsFromCharts(state,from,to,p);return visual.symbolSprite.material.map;});
    return {normal:orange(m.planetSymbolTexture('☿','#ffffff')),retro:orange(m.planetSymbolTexture('☿','#ffffff',true)),flat:orange(m.planetSymbolOutlineTexture('☿','#ffffff',true)),motion:[0,1].map(p=>m.interpolatedTransitChart(from,to,p).transits[0].retrograde),spriteMotion};
   });
   assert.equal(textureCheck.normal,0);assert.ok(textureCheck.retro>0&&textureCheck.flat>0);assert.deepEqual(textureCheck.motion,[true,false]);
   assert.deepEqual(textureCheck.spriteMotion,['R','D']);
   await page.getByRole('button',{name:'アスペクト一覧',exact:true}).click();
   const list=page.locator('section[aria-label="アスペクト一覧"]');
   await list.getByRole('button',{name:'出生図との関係',exact:true}).click();
   const labels=list.getByText(/現行水星逆行/);
   if(!direct) await labels.first().waitFor();else assert.equal(await labels.count(),0);
   await list.getByRole('button',{name:'現行天体同士',exact:true}).click();
   if(!direct) {
    await list.getByText(/現行水星逆行.*現行土星逆行/).first().waitFor();
    const marker=list.getByText('逆行',{exact:true}).first();
    assert.equal(await marker.evaluate(el=>getComputedStyle(el).borderRadius),'9999px');
    assert.notEqual(await marker.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
   }
   if(width===390&&!direct) await page.screenshot({path:'../artifacts/retrograde-list-mobile.png'});
   await list.getByRole('button',{name:'詳細情報を閉じる',exact:true}).click();
   if(width<640) await page.getByRole('button',{name:'3Dマップを全画面で表示',exact:true}).click();
   await page.getByRole('button',{name:'天体データ',exact:true}).click();
   const table=page.locator('section[aria-label="天体データ"]');
   const badges=await table.locator('[aria-label="逆行中"]:visible').count();
   if(direct) assert.equal(badges,0);else assert.ok(badges>=2);
   assert.deepEqual(errors,[]);
   console.log(`${width}px ${direct?'direct':'retrograde'}: chart badges, heading, normal/flat symbol textures and playback flags OK`);
  }
  await page.close();
 }
}finally{await browser.close();}
