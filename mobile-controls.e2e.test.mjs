import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL=process.env.ARENA_URL||'http://127.0.0.1:5196/';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const errors=[];
const checks=[];
const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const page=await context.newPage();
// Model the non-fullscreen iPhone browser path; desktop Chrome's fullscreen UA styles pin its dimensions.
await page.addInitScript(()=>{Element.prototype.requestFullscreen=undefined;});
page.on('pageerror',error=>errors.push(error.message));
await page.route(/\/main-2d\.js(?:\?.*)?$/,async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:(await response.text())+`
    window.__mobileQA={
      state:()=>({running,paused,input:localInputState(),held:{...held},x:player.x,grounded:player.grounded}),
      ready:()=>{countdown=0;aiTimer=999;fighters.forEach(f=>resetFighter(f,true));player.x=700;cpu.x=1250;clearInputs();},
      clear:()=>clearInputs(),resize:()=>resize(),menu:()=>showMenu(),
    };
  `});
});
const cdp=await context.newCDPSession(page);
const point=async(selector,id=1)=>{
  const box=await page.locator(selector).boundingBox();
  return {id,x:box.x+box.width/2,y:box.y+box.height/2,radiusX:8,radiusY:8,force:1};
};
const stickPoint=async(offsetX=0,offsetY=0,id=1)=>{
  const box=await page.locator('.move-pad').boundingBox();
  const radius=Math.min(box.width,box.height)/2;
  return {id,x:box.x+box.width/2+offsetX*radius,y:box.y+box.height/2+offsetY*radius,radiusX:8,radiusY:8,force:1};
};
const touch=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
const state=()=>page.evaluate(()=>window.__mobileQA.state());
const readStick=()=>page.evaluate(()=>{
  const pad=document.querySelector('.move-pad'),knob=pad.querySelector('.stick-knob');
  const base=pad.getBoundingClientRect(),tip=knob.getBoundingClientRect();
  return {active:pad.classList.contains('active'),x:parseFloat(pad.style.getPropertyValue('--stick-x'))||0,y:parseFloat(pad.style.getPropertyValue('--stick-y'))||0,
    radius:Math.min(base.width,base.height)/2,knobRadius:Math.max(tip.width,tip.height)/2,
    renderedX:tip.x+tip.width/2-(base.x+base.width/2),renderedY:tip.y+tip.height/2-(base.y+base.height/2)};
});
async function assertCentered(){
  const stick=await readStick();
  assert.equal(stick.active,false);
  assert.equal(stick.x,0);assert.equal(stick.y,0);
  await page.waitForFunction(()=>{
    const base=document.querySelector('.move-pad').getBoundingClientRect(),tip=document.querySelector('.stick-knob').getBoundingClientRect();
    return Math.abs(tip.x+tip.width/2-(base.x+base.width/2))<.5&&Math.abs(tip.y+tip.height/2-(base.y+base.height/2))<.5;
  });
}

async function assertGeometry(){
  const boxes=await page.evaluate(()=>{
    const box=el=>{const {x,y,width,height}=el.getBoundingClientRect();return{x,y,width,height};};
    return {shell:box(document.getElementById('game-shell')),canvas:box(document.getElementById('arena')),
      stick:{name:'left joystick',...box(document.querySelector('.move-pad'))},
      buttons:[...document.querySelectorAll('.touch-controls button')].map(el=>({name:el.getAttribute('aria-label'),letter:el.querySelector('b')?.textContent,action:el.dataset.action||el.dataset.hold,...box(el)})),
      scrollX,scrollY,innerWidth,innerHeight};
  });
  assert.deepEqual(boxes.canvas,boxes.shell,'canvas and controls must share the same bounds');
  assert.equal(boxes.buttons.length,4,'exactly four face buttons');
  const byAction=Object.fromEntries(boxes.buttons.map(button=>[button.action,button]));
  const [top,right,bottom,left]=['jump','attack','special','guard'].map(action=>byAction[action]);
  assert.deepEqual([top.letter,right.letter,bottom.letter,left.letter],['X','A','B','Y']);
  const cx=box=>box.x+box.width/2,cy=box=>box.y+box.height/2;
  assert(Math.abs(cx(top)-cx(bottom))<.1&&Math.abs(cy(left)-cy(right))<.1,'opposite buttons share a diamond axis');
  assert(cy(top)<cy(left)&&cy(left)<cy(bottom)&&cx(left)<cx(top)&&cx(top)<cx(right),'X top, A right, B bottom and Y left');
  assert(Math.abs(boxes.stick.width-boxes.stick.height)<.1,'left stick is circular');
  const controls=[boxes.stick,...boxes.buttons];
  for(const button of controls){
    assert(button.width>=52&&button.height>=52,`${button.name}: minimum target 52px`);
    assert(button.x>=boxes.shell.x&&button.y>=boxes.shell.y,`${button.name}: starts inside visible shell`);
    assert(button.x+button.width<=boxes.shell.x+boxes.shell.width&&button.y+button.height<=boxes.shell.y+boxes.shell.height,`${button.name}: fully visible`);
  }
  for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){
    const a=controls[i],b=controls[j];
    assert(a.x+a.width<=b.x+.1||b.x+b.width<=a.x+.1||a.y+a.height<=b.y+.1||b.y+b.height<=a.y+.1,`${a.name} overlaps ${b.name}`);
  }
  assert.equal(boxes.scrollX,0);assert.equal(boxes.scrollY,0);
  return boxes;
}

try{
  await page.goto(baseURL,{waitUntil:'networkidle'});
  await page.locator('#title-start-button:not([disabled])').click();
  await page.locator('#title-screen').waitFor({state:'hidden'});
  await page.locator('#start-button:not([disabled])').waitFor();
  await page.locator('#start-button').click();
  await page.locator('#start-screen').waitFor({state:'hidden'});
  await page.evaluate(()=>window.__mobileQA.ready());
  const left=await stickPoint(-.65);
  const right=await stickPoint(.65);
  const center=await stickPoint();
  await touch('touchStart',[left]);
  assert.equal((await state()).held.left,true);
  assert.equal((await readStick()).active,true);
  await touch('touchMove',[right]);
  assert.equal((await state()).held.right,true);
  assert.equal((await state()).held.left,false);
  await touch('touchMove',[center]);
  assert.equal((await state()).held.right,false);
  await touch('touchMove',[right]);
  const attack=await point('[data-action="attack"]',2);
  await touch('touchStart',[right,attack]);
  assert.equal((await state()).held.right,true);
  assert.equal((await state()).held.attack,true);
  // CDP touchEnd lists the fingers being released; touchMove cannot lift an omitted finger.
  await touch('touchEnd',[attack]);
  assert.equal((await state()).held.attack,false);
  assert.equal((await state()).held.right,true);
  const jump=await point('[data-action="jump"]',3);
  await touch('touchStart',[right,jump]);
  await page.waitForFunction(()=>!window.__mobileQA.state().grounded);
  await touch('touchEnd',[]);
  assert.equal((await state()).held.right,false);
  await assertCentered();
  checks.push('real multi-touch: circular stick changes direction, neutral stops, moving attack and moving jump');

  await page.evaluate(()=>window.__mobileQA.ready());
  await touch('touchStart',[right]);
  const diagonal=await stickPoint(1.7,-1.7);
  await touch('touchMove',[diagonal]);
  const tilted=await readStick();
  assert(tilted.x>0&&tilted.y<0,'knob follows both diagonal axes');
  assert(Math.abs(tilted.x+tilted.y)<.1,'equal diagonal follows the input angle');
  assert(Math.abs(tilted.renderedX-tilted.x)<.1&&Math.abs(tilted.renderedY-tilted.y)<.1,'active knob follows CSS position without animation lag');
  assert(Math.hypot(tilted.x,tilted.y)<=tilted.radius*.48+.1,'outside motion is clamped radially');
  assert(Math.hypot(tilted.x,tilted.y)+tilted.knobRadius<=tilted.radius+.1,'the knob remains inside the circular base');
  assert.equal((await state()).held.right,true,'outside diagonal keeps moving');
  await touch('touchMove',[await stickPoint(2.4)]);
  assert.equal((await state()).held.right,true,'captured thumb outside the base keeps its direction');
  await touch('touchMove',[await stickPoint(0,-1.6)]);
  assert.equal((await state()).held.right,false);
  await touch('touchMove',[right]);
  assert.equal((await state()).held.right,true);
  await touch('touchCancel',[]);
  assert.equal((await state()).held.right,false);
  await assertCentered();
  await touch('touchStart',[right]);
  await page.evaluate(()=>window.__mobileQA.clear());
  await touch('touchMove',[left]);
  assert.equal((await state()).held.left,false);
  await touch('touchEnd',[]);
  await assertCentered();
  checks.push('diagonal knob motion, radial clamp, outside drag, vertical neutral, cancel and clear reset');

  for(const [width,height] of [[844,390],[667,375],[568,320],[740,280]]){
    await page.setViewportSize({width,height});
    await page.waitForFunction(({width,height})=>{
      const el=document.getElementById('game-shell');return el.clientWidth===width&&el.clientHeight===height;
    },{width,height});
    await assertGeometry();
    await page.screenshot({path:`/private/tmp/skybreak-mobile-${width}x${height}.png`});
  }
  checks.push('four landscape sizes: circular stick and four compact 52px+ diamond buttons without overlap or clipping');

  await page.setViewportSize({width:844,height:390});
  await page.evaluate(()=>window.__mobileQA.ready());
  await touch('touchStart',[{id:7,x:420,y:200}]);
  await touch('touchMove',[{id:7,x:420,y:80}]);
  await touch('touchEnd',[]);
  await assertGeometry();
  assert.equal(await page.evaluate(()=>document.scrollingElement.scrollTop),0);
  checks.push('dragging the fight does not scroll the page');

  // Controlled viewport simulation, not a claim of physical iPhone reproduction.
  const toolbarThumb=await stickPoint(.65,0,8);
  await touch('touchStart',[toolbarThumb]);
  assert.equal((await state()).held.right,true);
  await page.evaluate(()=>{
    const fake=new EventTarget();Object.assign(fake,{width:844,height:300,offsetLeft:0,offsetTop:44,scale:1});
    window.__realVisualViewport=window.visualViewport;
    Object.defineProperty(window,'visualViewport',{configurable:true,value:fake});
    dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(()=>document.getElementById('game-shell').clientHeight===300);
  const shifted=await assertGeometry();
  assert.equal(shifted.shell.y,44);
  assert.equal((await state()).held.right,true,'toolbar height changes must not release a held thumb');
  await page.evaluate(()=>{
    window.visualViewport.offsetTop=12;dispatchEvent(new Event('scroll'));
  });
  await page.waitForFunction(()=>document.getElementById('game-shell').getBoundingClientRect().y===12);
  await assertGeometry();
  assert.equal((await state()).held.right,true,'toolbar offset changes must preserve held input');
  await page.evaluate(()=>{
    Object.defineProperty(window,'visualViewport',{configurable:true,value:window.__realVisualViewport});
    dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(()=>document.getElementById('game-shell').clientHeight===390);
  assert.equal((await state()).held.right,true);
  await touch('touchEnd',[toolbarThumb]);
  assert.equal((await state()).held.right,false);
  await assertCentered();
  checks.push('simulated Safari toolbar size/offset changes keep canvas and buttons aligned and preserve held input');

  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>window.__mobileQA.state().paused);
  await page.evaluate(()=>window.__mobileQA.menu());
  await page.waitForFunction(()=>document.getElementById('start-screen').classList.contains('visible'));
  await page.locator('#pause-screen').waitFor({state:'hidden'});
  await page.evaluate(()=>document.getElementById('start-screen').scrollTop=0);
  const before=await page.locator('#start-screen').evaluate(el=>el.scrollTop);
  const description=await page.locator('.selection-detail').boundingBox();
  const scrollTouch={id:9,x:description.x+description.width/2,y:Math.min(760,description.y+20)};
  await touch('touchStart',[scrollTouch]);
  await touch('touchMove',[{...scrollTouch,y:scrollTouch.y-100}]);
  await touch('touchMove',[{...scrollTouch,y:scrollTouch.y-250}]);
  await touch('touchEnd',[]);
  await page.waitForFunction(before=>document.getElementById('start-screen').scrollTop>before,before);
  assert.equal(await page.evaluate(()=>scrollY),0);
  checks.push('portrait character menu still scrolls inside the fixed game shell');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:checks.length,checks},null,2));
}finally{await browser.close();}
