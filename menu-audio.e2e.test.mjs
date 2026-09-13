import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Inspect real audio/media only in test responses, never in the shipped game.
const baseURL = process.env.ARENA_URL || 'http://127.0.0.1:5196/';
const browser = await chromium.launch({headless:true,channel:'chrome',args:['--autoplay-policy=user-gesture-required']});
const errors=[], checks=[];
async function openGame(mobile=false, failTrack='') {
  const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile});
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const state=window.__soundTest={players:[],contexts:[],oscillators:[],analysers:[]};
    const NativeContext=window.AudioContext;
    window.AudioContext=class extends NativeContext {
      constructor(...args){super(...args);state.contexts.push(this);}
      createMediaElementSource(player){state.players.push(player);return super.createMediaElementSource(player);}
      createOscillator(){
        const osc=super.createOscillator(), start=osc.start.bind(osc);
        osc.start=(...args)=>{state.oscillators.push({frequency:osc.frequency.value,time:this.currentTime});return start(...args);};
        return osc;
      }
      createDynamicsCompressor(){
        const limiter=super.createDynamicsCompressor(), analyser=this.createAnalyser();
        analyser.fftSize=2048;limiter.connect(analyser);state.analysers.push(analyser);return limiter;
      }
    };
  });
  await page.route(/\/main-2d\.js(?:\?.*)?$/,async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+`
      window.__soundGame={finish:()=>finishMatch(true),state:()=>({running,paused}),ui:kind=>audio.ui(kind)};
    `});
  });
  if(failTrack)await page.route(`**/${failTrack}`,route=>route.abort());
  await page.goto(baseURL,{waitUntil:'networkidle'});
  await page.locator('#title-start-button:not([disabled])').waitFor();
  return page;
}
const snapshot=page=>page.evaluate(()=>({
  players:window.__soundTest.players.map(p=>({src:p.currentSrc||p.src,time:p.currentTime,paused:p.paused,duration:p.duration,error:p.error?.code})),
  oscillators:window.__soundTest.oscillators.length,
}));
async function playing(page,file) {
  await page.waitForFunction(file=>{
    const p=window.__soundTest.players[0];return p&&!p.paused&&(p.currentSrc||p.src).includes(file)&&p.currentTime>.1;
  },file);
  assert.equal((await snapshot(page)).players.length,1,'Only one BGM player exists');
}
async function outputSignal(page) {
  await page.waitForFunction(()=>window.__soundTest.analysers.some(a=>{
    const data=new Float32Array(a.fftSize);a.getFloatTimeDomainData(data);
    return data.some(x=>Math.abs(x)>.0001);
  }));
}

try {
  for(const mobile of [false,true]) {
    const page=await openGame(mobile);
    for(const size of mobile?[{width:844,height:390},{width:568,height:320},{width:390,height:844}]:[{width:1280,height:800}]) {
      await page.setViewportSize(size);
      await page.waitForFunction(size=>document.getElementById('game-shell').clientWidth===size.width,size);
      const box=await page.locator('#title-sound-button').boundingBox();
      assert(box&&box.width>=44&&box.height>=44&&box.x>=0&&box.y>=0&&box.x+box.width<=size.width&&box.y+box.height<=size.height,'Menu mute must fit the screen');
      await page.screenshot({path:`/private/tmp/skybreak-menu-music-${size.width}x${size.height}.png`});
    }
    if(mobile)await page.setViewportSize({width:844,height:390});
    assert.equal((await snapshot(page)).oscillators,0,'No sound before interaction');
    assert((await snapshot(page)).players.every(p=>p.paused),'No autoplay before interaction');
    const first=page.locator('#title-start-button');
    if(mobile)await first.tap();else await first.click();
    await playing(page,'menu-theme');
    await page.waitForFunction(()=>window.__soundTest.oscillators.length>0);
    await outputSignal(page);
    const initial=await snapshot(page);
    await page.locator('[data-character="jet"]').click();
    await page.locator('#title-back-button').click();
    await playing(page,'menu-theme');
    assert((await snapshot(page)).players[0].time>=initial.players[0].time,'Returning to title must not rewind music');
    await page.locator('#title-start-button').click();
    await page.locator('#opponent-select').selectOption('arc');
    await page.waitForFunction(n=>window.__soundTest.oscillators.length>n,initial.oscillators);
    await page.locator('#online-button').click();
    await page.locator('#online-screen.visible').waitFor();
    await playing(page,'menu-theme');
    await page.locator('#online-cancel-button').click();
    const afterCancel=await snapshot(page);
    assert(afterCancel.players[0].time>=initial.players[0].time,'Menu/wait/cancel must continue the same song');
    await page.locator('#start-button').click();
    await playing(page,'battle-theme');
    await outputSignal(page);
    await page.locator('#pause-button').click();
    await page.locator('#pause-screen.visible').waitFor();
    assert((await snapshot(page)).players[0].paused,'Pause stops BGM');
    const paused=await snapshot(page);
    await page.waitForTimeout(80); // Separate intentional taps beyond the double-tap guard.
    await page.evaluate(()=>window.__soundGame.ui('select'));
    await page.waitForFunction(n=>window.__soundTest.oscillators.length>n,paused.oscillators);
    assert((await snapshot(page)).players[0].paused,'Pause menu sounds must not restart BGM');
    await page.locator('#resume-button').click();
    await playing(page,'battle-theme');
    assert((await snapshot(page)).players[0].time>=paused.players[0].time-.05,'Resume must retain position');
    await page.evaluate(()=>window.__soundGame.finish());
    await page.locator('#result-screen.visible').waitFor();
    await playing(page,'menu-theme');
    await page.locator('#restart-button').click();
    await playing(page,'battle-theme');
    await page.locator('#pause-button').click();
    await page.locator('#menu-button').click();
    await playing(page,'menu-theme');
    await page.locator('#menu-sound-button').click();
    assert((await snapshot(page)).players[0].paused,'Mute pauses the music');
    const muted=await snapshot(page);
    await page.locator('[data-character="mist"]').click();
    assert.equal((await snapshot(page)).oscillators,muted.oscillators,'Mute also silences selection');
    await page.locator('#menu-sound-button').click();
    await playing(page,'menu-theme');
    await page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert((await snapshot(page)).players[0].paused,'Hidden tab stops audio');
    await page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await playing(page,'menu-theme');
    await page.evaluate(()=>{
      const p=window.__soundTest.players[0];p.currentTime=p.duration-.05;
    });
    await page.waitForFunction(()=>window.__soundTest.players[0].currentTime<2);
    await playing(page,'menu-theme');
    checks.push(`${mobile?'touch':'desktop'}: first title sound, title/menu/wait/result switching, pause/resume, mute, hidden tab, loop, one music player`);
    await page.context().close();
  }
  const direct=await openGame(true);
  await direct.locator('#title-start-button').tap();
  await playing(direct,'menu-theme');
  assert.equal(await direct.evaluate(()=>window.__soundGame.state().running),false,'Title tap must only open selection');
  await direct.locator('#start-button').tap();
  await playing(direct,'battle-theme');
  await direct.locator('#pause-button').click();
  await direct.locator('#menu-button').click();
  await playing(direct,'menu-theme');
  checks.push('Title tap starts menu music without battle; choosing battle changes tracks and returning restores menu music');
  await direct.context().close();

  const firstMute=await openGame();
  await firstMute.locator('#title-sound-button').hover();
  await firstMute.mouse.down();
  assert.equal((await snapshot(firstMute)).players.length,0,'A first mute press must not unlock music before release');
  await firstMute.mouse.up();
  assert((await snapshot(firstMute)).players.every(p=>p.paused),'A first mute click must stay silent');
  await firstMute.locator('#title-start-button').click();
  assert((await snapshot(firstMute)).players.every(p=>p.paused),'Entering selection while muted stays silent');
  await firstMute.locator('#menu-sound-button').click();
  await playing(firstMute,'menu-theme');
  checks.push('Muting as the first interaction stays silent, even while the pointer is held');
  await firstMute.context().close();

  const noBattle=await openGame(false,'battle-theme.mp4');
  await noBattle.locator('#title-start-button').click();
  await noBattle.locator('#start-button').click();
  await playing(noBattle,'ignition');
  await outputSignal(noBattle);
  checks.push('Missing battle track falls back to IGNITION');
  await noBattle.context().close();

  const noMenu=await openGame(false,'menu-theme.m4a');
  await noMenu.locator('#title-start-button').click();
  await noMenu.locator('[data-character="jet"]').click();
  await noMenu.waitForFunction(()=>window.__soundTest.oscillators.length>0);
  assert((await snapshot(noMenu)).players.every(p=>!p.src.includes('battle-theme')&&!p.src.includes('ignition')));
  await noMenu.locator('#start-button').click();
  await playing(noMenu,'battle-theme');
  checks.push('Missing menu music keeps selection sound and battle audio available');
  await noMenu.context().close();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({checks,errors},null,2));
} finally {await browser.close();}
