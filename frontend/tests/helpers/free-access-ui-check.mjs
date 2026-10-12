import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire('C:/Users/morii/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
  for(const width of process.argv.includes('--desktop-only') ? [1280] : [390,1280]) {
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error') console.log('Browser console:',message.text());});
    page.on('response',response=>{if(response.status()>=400) console.log('HTTP error:',response.status(),response.url());});
    for(const plan of ['free','paid']) {
      await page.goto(`http://127.0.0.1:5195/free-access-fixture?plan=${plan}`);
      const menu=page.getByRole('button',{name:'ナビゲーションを開く',exact:true});
      try {await menu.waitFor({timeout:15000});} catch(error) {console.log('UI errors:',errors);console.log((await page.locator('body').innerText()).slice(0,1500));throw error;}
      assert.equal(await menu.getAttribute('aria-expanded'),String(plan==='free'));
      if(plan==='free') {
        await page.getByRole('button',{name:'星の見通し 🔒',exact:true}).waitFor({state:'visible'});
        const headerBox=await page.locator('header').boundingBox();
        const headingBox=await page.getByRole('heading',{name:'Horoscope',exact:true}).boundingBox();
        assert.ok(headingBox.y>=headerBox.y+headerBox.height,`expanded navigation must not cover content: header bottom=${headerBox.y+headerBox.height}, heading top=${headingBox.y}`);
        await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'false');
        await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');
      } else {
        await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'true');
        await menu.click();assert.equal(await menu.getAttribute('aria-expanded'),'false');
      }
      await page.getByRole('button',{name:'アスペクト一覧',exact:true}).click();
      const list=page.locator('section[aria-label="アスペクト一覧"]');
      await list.waitFor({state:'visible'});
      assert.equal(await list.getByRole('button',{name:'複合アスペクト',exact:true}).isDisabled(),plan==='free');
      for(const name of ['ネイタル同士','出生図との関係','現行天体同士']) {
        const button=list.getByRole('button',{name,exact:true});
        assert.equal(await button.isEnabled(),true);await button.click();
        assert.equal(await button.getAttribute('aria-pressed'),'true');
      }
      console.log(`${width}px ${plan}: menu and aspect list OK`);
    }
    await page.goto('http://127.0.0.1:5195/free-access-fixture?screen=annual&plan=paid');
    await page.getByRole('button',{name:'拡大と発展',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'補足',exact:true}).count(),0);
    for(const name of ['総括','拡大と発展','成長課題','全般','恋愛・対人','仕事','お金']) await page.getByRole('button',{name,exact:true}).click();
    assert.deepEqual(errors,[]);
    console.log(`${width}px annual: supplementary tabs hidden, remaining tabs OK`);
    await page.close();
  }
} finally {await browser.close();}
