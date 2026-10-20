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
  await panel.getByText('水星',{exact:true}).first().waitFor();
  assert.ok((await panel.innerText()).includes('2026/6/30'));
  assert.ok((await panel.innerText()).includes('2031/4/18'));
  assert.equal(await panel.getByText('逆行開始',{exact:true}).count()+await panel.getByText('順行開始',{exact:true}).count(),91);
  await panel.getByRole('button',{name:'天体別',exact:true}).click();
  await panel.getByRole('button',{name:'日付順',exact:true}).click();
  await button.click();await button.click();
  await panel.getByText('水星',{exact:true}).first().waitFor();
  assert.equal(await page.evaluate(()=>window.calendarLoads||0),0);
  assert.deepEqual(errors,[]);console.log(`${width}px: 91 bundled master events including past dates, zero API calls, sorting/reopen OK`);
  await page.close();
 }
}finally{await browser.close();}
