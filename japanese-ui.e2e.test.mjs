import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// All game-state controls below are injected into the test response only.
// No test hook, artificial mode, or WebSocket connection is shipped to the game.
const baseURL=process.env.ARENA_URL||'http://127.0.0.1:5196/';
const expected={
  arc:['アーク','サンダーショット','マックスサンダー'],
  jet:['ジェット','プラズマショット','スターレーザー'],
  mist:['ミスト','スターショット','スタークラッシュ'],
  brick:['ブリック','ボルトショット','ファーネスブレイク'],
  spring:['スプリング','ウィンドショット','スカイサイクロン'],
};
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
const page=await context.newPage();
const errors=[],sockets=[],checks=[],layouts=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('websocket',socket=>{
  const address=new URL(socket.url()),app=new URL(baseURL);
  // Vite's same-origin live-reload socket is not a matchmaking connection.
  if(address.host===app.host&&address.pathname==='/'&&address.searchParams.has('token'))return;
  sockets.push(address.origin+address.pathname);
});
await page.addInitScript(()=>{Element.prototype.requestFullscreen=undefined;});
await page.route(/\/main-2d\.js(?:\?.*)?$/,async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:await response.text()+`
    window.__japaneseUI={
      roster:()=>Object.fromEntries(Object.entries(roster).map(([key,f])=>[key,[f.name,f.normalName,f.maxName]])),
      saved:()=>JSON.parse(localStorage.getItem('skybreak-preferences-v2')),
      menu:()=>showMenu(),
      ready(){
        resetMatch(false,false);countdown=0;clearInputs();
        player.x=400;cpu.x=1250;cpu.aiTimer=999;aiTimer=999;updateHud();
      },
      charge(){player.ultimate=99;player.specialCooldown=player.specialTimer=player.attackTimer=0;charge(player,1);updateHud();},
      state:()=>({key:player.key,meter:player.ultimate,shots:projectiles.map(p=>({maximum:p.maximum,owner:p.owner.key})),running,paused}),
      roles(mode,sameCharacter=false){
        running=false;paused=true;onlineRole=null;demoMode=mode==='demo';onlineMode=mode==='online';
        if(sameCharacter)applyCharacter(cpu,player.key);
        for(const [f,prefix] of [[player,'player'],[cpu,'cpu']]){
          resetFighter(f,true);ui[prefix+'Name'].textContent=f.name;
        }
        setModeUi();updateHud();
        const labels=[],original=ctx.fillText;
        ctx.fillText=function(text,...args){labels.push(String(text));return original.call(this,text,...args);};
        try{draw(1000);}finally{ctx.fillText=original;}
        return {hud:[$('player-role').textContent,$('cpu-role').textContent],heads:labels.slice(-2)};
      },
      finish(outcome,demo=false){
        clearTimeout(resultTimer);running=true;paused=false;onlineMode=false;onlineRole=null;demoMode=demo;
        [ui.start,ui.pause,ui.online].forEach(el=>el.classList.remove('visible'));
        finishMatch(outcome,{notifyPeer:false});
        return {title:$('result-title').textContent,winner:outcome===null?null:outcome?player.name:cpu.name};
      },
      cue(kind){
        running=true;paused=false;onlineMode=demoMode=false;onlineRole=null;
        clearInputs();resetFighter(player,true);resetFighter(cpu,true);
        if(kind==='fight'){countdown=.001;countdownCue=1;simulate(.002);}
        if(kind==='ringout')ringOut(cpu);
        if(kind==='guard'){cpu.guard=true;cpu.shield=1;hit(cpu,player,5,200,-100,1);}
        paused=true;return ui.callout.textContent;
      },
    };
  `});
});

// Measure text fragments, not only an element's box: Japanese text can overflow
// a fixed-width button while its own element still reports the expected width.
async function assertTextFits(selectors,{withinViewport=false}={}){
  const problems=await page.evaluate(({selectors,withinViewport})=>{
    const issues=[];
    for(const selector of selectors)for(const el of document.querySelectorAll(selector)){
      if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')continue;
      const parent=el.closest('button')||el.parentElement;
      const bound=parent.getBoundingClientRect();
      const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        const node=walker.currentNode;if(!node.textContent.trim())continue;
        const range=document.createRange();range.selectNodeContents(node);
        for(const r of range.getClientRects()){
          if(r.left<bound.left-2||r.right>bound.right+2)
            issues.push({selector,text:node.textContent.trim(),problem:'text outside containing control',left:r.left,right:r.right,parentLeft:bound.left,parentRight:bound.right});
          if(withinViewport&&(r.left< -1||r.right>innerWidth+1))
            issues.push({selector,text:node.textContent.trim(),problem:'text outside horizontal viewport'});
        }
      }
      if(el.scrollWidth>el.clientWidth+2&&['hidden','clip'].includes(getComputedStyle(el).overflowX))
        issues.push({selector,text:el.textContent.trim(),problem:'clipped overflow'});
    }
    return issues;
  },{selectors,withinViewport});
  assert.deepEqual(problems,[],JSON.stringify(problems));
}

async function assertTouchGeometry(){
  const data=await page.evaluate(()=>{
    const rect=el=>{const {x,y,width,height}=el.getBoundingClientRect();return {x,y,width,height};};
    return {width:innerWidth,height:innerHeight,buttons:[...document.querySelectorAll('.touch-controls button')].map(el=>({letter:el.querySelector('b').textContent,...rect(el)}))};
  });
  assert.deepEqual(data.buttons.map(b=>b.letter),['X','A','B','Y']);
  for(const b of data.buttons){
    assert(b.width>=52&&b.height>=52,`${b.letter}: target must remain at least 52px`);
    assert(b.width<=56.1&&b.height<=56.1,`${b.letter}: translation must not enlarge the compact controls`);
    assert(b.x>=0&&b.y>=0&&b.x+b.width<=data.width+.1&&b.y+b.height<=data.height+.1,`${b.letter}: fully visible`);
  }
  return data.buttons[0].width;
}

try{
  await page.goto(baseURL,{waitUntil:'networkidle'});
  await page.locator('#title-start-button:not([disabled])').click();
  await page.locator('#title-screen').waitFor({state:'hidden'});
  await page.locator('#start-button:not([disabled])').waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__japaneseUI.roster()),expected);
  const options=await page.locator('#opponent-select option').evaluateAll(elements=>Object.fromEntries(elements.map(el=>[el.value,el.textContent])));
  assert.deepEqual(options,{auto:'おまかせ',...Object.fromEntries(Object.entries(expected).map(([key,values])=>[key,values[0]]))});
  for(const [key,[name,normal,maximum]] of Object.entries(expected)){
    await page.locator('[data-character="'+key+'"]').click();
    assert.equal(await page.locator('[data-character="'+key+'"] strong').textContent(),name);
    assert.equal(await page.locator('#selected-title').textContent(),name);
    assert.equal(await page.locator('#normal-move').textContent(),normal);
    assert.equal(await page.locator('#max-move').textContent(),maximum);
    await page.locator('#opponent-select').selectOption(key);
    assert.equal(await page.locator('#start-button small').textContent(),name+' VS '+name);
    const saved=await page.evaluate(()=>window.__japaneseUI.saved());
    assert.equal(saved.character,key);assert.equal(saved.opponent,key);
    await assertTextFits(['.character-option strong','#selected-title','#normal-move','#max-move','.match-actions button span','.match-actions button small'],{withinViewport:true});

    await page.locator('#start-button').click();
    await page.evaluate(()=>window.__japaneseUI.ready());
    assert.equal(await page.locator('#player-name').textContent(),name);
    await page.evaluate(()=>window.__japaneseUI.charge());
    assert.equal(await page.locator('#center-callout').textContent(),'必殺技OK！');
    assert.equal(await page.locator('#ultimate-value').textContent(),'OK');
    assert.equal(await page.locator('#b-label').textContent(),'MAX!');
    assert.equal(await page.locator('[data-action="special"]').getAttribute('aria-label'),maximum+'を発動');
    await page.locator('[data-action="special"]').tap();
    const state=await page.evaluate(()=>window.__japaneseUI.state());
    assert.equal(state.meter,0);assert(state.shots.some(shot=>shot.maximum&&shot.owner===key));
    assert.equal(await page.locator('#ultimate-value').textContent(),'0%');
    assert.equal(await page.locator('#b-label').textContent(),'ショット');
    assert.equal(await page.locator('[data-action="special"]').getAttribute('aria-label'),'通常技 '+normal);
    assert((await page.locator('#center-callout').textContent()).startsWith(maximum));
    await page.evaluate(()=>window.__japaneseUI.menu());
  }
  checks.push('5 unchanged character IDs, Katakana character/move names, matching opponent options and real B/MAX input labels');
  await page.reload({waitUntil:'networkidle'});
  await page.locator('#title-start-button:not([disabled])').click();
  await page.locator('#title-screen').waitFor({state:'hidden'});
  await page.locator('#start-button:not([disabled])').waitFor();
  assert.equal(await page.locator('[data-character="spring"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('#opponent-select').inputValue(),'spring');
  checks.push('preference reload keeps canonical spring IDs and renders the Japanese selection');

  for(const [mode,roles] of [['offline',['自分','CPU']],['online',['自分','相手']],['demo',['CPU 1','CPU 2']]]){
    const labels=await page.evaluate(mode=>window.__japaneseUI.roles(mode,true),mode);
    assert.deepEqual(labels.hud,roles,mode+' HUD role');
    assert.deepEqual(labels.heads,roles,mode+' Canvas role');
  }
  checks.push('offline/online/demo roles agree between HUD and rendered Canvas, including identical fighters; no network is used');
  for(const [cue,expectedText] of [['fight','ファイト！'],['ringout','場外！'],['guard','ガードブレイク']]){
    assert.equal(await page.evaluate(cue=>window.__japaneseUI.cue(cue),cue),expectedText);
  }
  checks.push('actual countdown, ring-out and guard-break events display localized announcements');
  for(const [outcome,title] of [[true,'勝利'],[false,'敗北'],[null,'引き分け']]){
    const result=await page.evaluate(outcome=>window.__japaneseUI.finish(outcome),outcome);
    assert.equal(result.title,title);
    await page.locator('#result-screen.visible').waitFor();
    assert(!(await page.locator('#restart-button').innerText()).includes('REMATCH'));
    await page.evaluate(()=>window.__japaneseUI.menu());
  }
  for(const outcome of [true,false]){
    const result=await page.evaluate(outcome=>window.__japaneseUI.finish(outcome,true),outcome);
    assert.equal(result.title,result.winner+'の勝利！');
    await page.evaluate(()=>window.__japaneseUI.menu());
  }
  checks.push('victory, defeat, draw and both demo winners have Japanese result headings');

  for(const [width,height] of [[844,390],[667,375],[568,320],[740,280],[390,844]]){
    await page.setViewportSize({width,height});
    await page.evaluate(()=>window.__japaneseUI.menu());
    await page.waitForFunction(({width,height})=>document.getElementById('game-shell').clientWidth===width&&document.getElementById('game-shell').clientHeight===height,{width,height});
    await page.locator('[data-character="spring"]').click();
    await page.locator('#opponent-select').selectOption('spring');
    await assertTextFits(['#select-title','.character-option strong','#selected-title','#normal-move','#max-move','.match-actions button span','.match-actions button small'],{withinViewport:true});
    const menuGeometry=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.getElementById('start-screen').scrollWidth,clientWidth:document.getElementById('start-screen').clientWidth}));
    assert(menuGeometry.scrollWidth<=menuGeometry.clientWidth+1,'menu must scroll vertically, never horizontally');
    await page.locator('#start-screen').evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:`/private/tmp/skybreak-japanese-menu-${width}x${height}.png`});
    let buttonSize=null;
    if(width>height){
      await page.locator('#start-button').click();
      await page.evaluate(()=>window.__japaneseUI.ready());
      await page.evaluate(()=>window.__japaneseUI.roles('online',true));
      await assertTextFits(['#player-name','#cpu-name','#player-role','#cpu-role','.action-pad small','.action-pad b'],{withinViewport:true});
      buttonSize=await assertTouchGeometry();
      await page.waitForFunction(()=>getComputedStyle(document.getElementById('start-screen')).visibility==='hidden');
      await page.screenshot({path:`/private/tmp/skybreak-japanese-battle-${width}x${height}.png`});
    }
    // Longest fighter name on both sides and in the result title catches the
    // expansion from the much shorter English "WINS" result treatment.
    await page.evaluate(()=>window.__japaneseUI.roles('demo',true));
    await page.evaluate(()=>window.__japaneseUI.finish(true,true));
    await page.locator('#result-screen.visible').waitFor();
    await page.waitForFunction(()=>Number(getComputedStyle(document.getElementById('result-screen')).opacity)===1);
    await assertTextFits(['#result-title','#result-copy','#restart-button span','#restart-button small','#change-character-button'],{withinViewport:true});
    await page.screenshot({path:`/private/tmp/skybreak-japanese-result-${width}x${height}.png`});
    layouts.push({width,height,buttonSize});
  }
  checks.push('5 portrait/landscape sizes: Japanese menu/move/result text fits, same-fighter HUD fits and compact controls remain 52–56px');
  assert.deepEqual(sockets,[],'this localization test must not connect to any matchmaker');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:checks.length,checks,layouts,errors},null,2));
}finally{await browser.close();}
