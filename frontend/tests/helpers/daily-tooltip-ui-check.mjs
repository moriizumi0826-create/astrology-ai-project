import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/morii/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 for(const width of [320,390,1280]) {
  const page=await browser.newPage({viewport:{width,height:1000},hasTouch:width<640}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5197/daily-tooltip-preview');
  const chart=page.getByRole('img',{name:'デイリーパフォーマンスグラフ',exact:true});
  await chart.waitFor();
  const box=await chart.boundingBox();
  for(const ratio of [0.1,0.9,0.49,0.51]) {
   const x=box.x+box.width*ratio,y=box.y+box.height*0.6;
   if(width<640) await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
   const tooltip=page.getByRole('tooltip',{name:'時間帯のスコア'});
   await tooltip.waitFor();
   const style=await tooltip.evaluate(el=>({left:el.style.left,right:el.style.right})),tip=await tooltip.boundingBox();
   assert.ok(tip.x>=box.x && tip.x+tip.width<=box.x+box.width);
   if(ratio===0.1) assert.equal(style.right,'8px');
   if(ratio===0.9) assert.equal(style.left,'8px');
   const line=await chart.locator('line[stroke="rgba(255,255,255,0.35)"]').getAttribute('x1');
   const viewWidth=await chart.evaluate(el=>el.viewBox.baseVal.width);
   const selectedX=box.x+Number(line)/viewWidth*box.width;
   assert.ok(selectedX<tip.x || selectedX>tip.x+tip.width,'tooltip must not overlap the selected time');
   for(const name of ['Mars','Drive','Flow','Inspiration','Friction']) assert.ok((await tooltip.innerText()).includes(name));
  }
  assert.deepEqual(errors,[]);
  if(width===390) await page.screenshot({path:'../artifacts/daily-tooltip-mobile.png'});
  console.log(`${width}px: opposite-edge placement and no overlap OK`);
  await page.close();
 }
}finally{await browser.close();}
