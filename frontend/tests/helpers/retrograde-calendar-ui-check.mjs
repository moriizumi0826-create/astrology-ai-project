import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/morii/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 for(const width of [390,1280]) {
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5198/retro-calendar-preview');
  const button=page.getByRole('button',{name:'逆行カレンダーを開く',exact:true});
  await button.click();const panel=page.locator('#forecast-retrograde-calendar');
  await panel.getByText('水星',{exact:true}).waitFor();
  assert.ok((await panel.innerText()).includes('2026/1/1'));
  assert.ok((await panel.innerText()).includes('2030/12/1'));
  await panel.getByRole('button',{name:'天体別',exact:true}).click();
  await panel.getByRole('button',{name:'日付順',exact:true}).click();
  await button.click();await button.click();
  await panel.getByText('水星',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.calendarLoads),1);
  assert.deepEqual(errors,[]);console.log(`${width}px: stale future-only reading replaced with all events; sorting/reopen OK`);
  await page.close();
 }
}finally{await browser.close();}
