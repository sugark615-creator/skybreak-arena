import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL=process.env.ARENA_URL||'http://127.0.0.1:5196/';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const checks=[],errors=[],sockets=[];
async function openPage(options={}){
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1,...options});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('websocket',socket=>{
    const address=new URL(socket.url()),app=new URL(baseURL);
    if(address.host===app.host&&address.pathname==='/'&&address.searchParams.has('token'))return;
    sockets.push(socket.url());
  });
  await page.addInitScript(()=>{Element.prototype.requestFullscreen=undefined;});
  await page.route(/\/main-2d\.js(?:\?.*)?$/,async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+`\nwindow.__titleTest=()=>({running,selectedCharacter,assetsReady,demoMode});`});
  });
  return page;
}
async function ready(page){await page.locator('#title-start-button:not([disabled])').waitFor();}
async function enter(page){
  await page.locator('#title-start-button').click();
  await page.locator('#title-screen').waitFor({state:'hidden'});
  await page.locator('#start-screen.visible').waitFor();
}
try{
  const page=await openPage();
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/assets/arc-poses-v2.png',async route=>{await gate;await route.continue();});
  await page.goto(baseURL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.__titleTest==='function');
  assert.equal(await page.locator('#title-start-button').isDisabled(),true);
  assert.equal(await page.locator('#start-screen').evaluate(el=>el.inert),true);
  assert.equal(await page.locator('#start-screen').isVisible(),false);
  assert.equal(await page.locator('#title-screen').evaluate(el=>el.classList.contains('title-ready')),false);
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>window.__titleTest().running),false);
  release();await ready(page);
  checks.push('Loading gates entry and hides unfinished sprites; no match or matchmaking starts on load');

  for(const [width,height] of [[1280,800],[844,390],[667,375],[568,320],[740,280],[390,844]]){
    await page.setViewportSize({width,height});
    await page.waitForFunction(width=>document.getElementById('game-shell').clientWidth===width,width);
    const failures=await page.evaluate(()=>{
      const failures=[];
      for(const id of ['title-logo','title-start-button','title-sound-button']){
        const el=document.getElementById(id),r=el.getBoundingClientRect();
        if(r.left<0||r.top<0||r.right>innerWidth+1||r.bottom>innerHeight+1)failures.push({id,rect:r.toJSON()});
        if(id.includes('button')&&(r.width<44||r.height<44))failures.push({id,problem:'small touch target'});
        const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
        while(walker.nextNode()){
          if(!walker.currentNode.textContent.trim())continue;
          const range=document.createRange();range.selectNodeContents(walker.currentNode);
          for(const text of range.getClientRects())if(text.left<r.left-2||text.right>r.right+2)failures.push({id,problem:'text overflow'});
        }
      }
      if(scrollX!==0||scrollY!==0)failures.push({problem:'page scrolling'});
      if(!document.querySelector('.topbar').inert||!document.querySelector('.touch-controls').inert)failures.push({problem:'active battle controls'});
      return failures;
    });
    assert.deepEqual(failures,[],`${width}x${height}: ${JSON.stringify(failures)}`);
    await page.screenshot({path:`/private/tmp/skybreak-title-${width}x${height}.png`});
  }
  checks.push('Title, start and mute fit six screen sizes; combat controls remain inactive');
  await enter(page);
  assert.equal(await page.evaluate(()=>window.__titleTest().running),false);
  assert.equal(await page.locator('#title-screen').evaluate(el=>el.inert),true);
  await page.locator('[data-character="mist"]').click();
  await page.locator('#title-back-button').click();
  assert.equal(await page.locator('#title-start-button').evaluate(el=>document.activeElement===el),true);
  await page.keyboard.down('Space');
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await page.locator('#title-screen').waitFor({state:'hidden'});
  assert.deepEqual(await page.evaluate(()=>window.__titleTest()),{running:false,selectedCharacter:'mist',assetsReady:true,demoMode:false});
  checks.push('Tap/keyboard open selection only; returning to title preserves selection and held Space cannot start battle');
  await page.reload({waitUntil:'networkidle'});await ready(page);
  assert.equal(await page.locator('#title-screen').isVisible(),true);
  assert.equal(await page.evaluate(()=>window.__titleTest().selectedCharacter),'mist');
  await page.locator('#title-sound-button').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#title-start-button').evaluate(el=>document.activeElement===el),true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#title-sound-button').evaluate(el=>document.activeElement===el),true);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await page.locator('#start-screen.visible').waitFor();
  assert.equal(await page.evaluate(()=>window.__titleTest().running),false);
  checks.push('Reload returns to title without losing saved choice; keyboard focus stays within title and Enter works');
  await page.context().close();

  const failed=await openPage();let failAsset=true;
  await failed.route('**/assets/arc-poses-v2.png',route=>failAsset?route.abort():route.continue());
  await failed.goto(baseURL,{waitUntil:'networkidle'});
  await failed.locator('#title-retry-button:not([hidden])').waitFor();
  assert.equal(await failed.locator('#title-start-button').isDisabled(),true);
  assert.match(await failed.locator('#title-status').textContent(),/再読み込み/);
  for(const [width,height] of [[740,280],[390,844]]){
    await failed.setViewportSize({width,height});
    await failed.waitForFunction(width=>document.getElementById('game-shell').clientWidth===width,width);
    for(const id of ['title-retry-button','title-status']){
      const box=await failed.locator('#'+id).boundingBox();
      assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1,'Retry button and explanation fit the screen');
    }
    await failed.screenshot({path:`/private/tmp/skybreak-title-error-${width}x${height}.png`});
  }
  failAsset=false;
  await Promise.all([failed.waitForEvent('load'),failed.locator('#title-retry-button').click()]);
  await ready(failed);await enter(failed);
  checks.push('Asset failure offers retry; retry recovers to selection');
  await failed.context().close();
  const calm=await openPage({reducedMotion:'reduce'});
  await calm.goto(baseURL,{waitUntil:'networkidle'});await ready(calm);
  assert.equal(await calm.locator('#title-screen').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running'&&a.effect.getTiming().iterations===Infinity).length),0);
  checks.push('Reduced-motion setting disables endless title animation');
  await calm.context().close();
  assert.deepEqual(sockets,[],'Opening or leaving title never connects to matchmaking');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
