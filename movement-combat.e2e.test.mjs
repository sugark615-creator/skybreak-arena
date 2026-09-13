import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url=process.env.ARENA_URL||'http://127.0.0.1:5196/';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const errors=[],results=[];
try {
  for(const mobile of [false,true]) {
    const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    await page.route(/\/main-2d\.js(?:\?.*)?$/,async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:await response.text()+`
        window.__movementTest={
          sampleJump(key,extra=false){
            running=true;paused=false;countdown=0;
            const f=fighter(roster[key],650,1),baseY=f.y,dt=1/120;
            let height=0,time=0,apexTime=0,airUsed=0,previousVy=-1;
            const initialJump=jump(f);
            for(let i=0;i<1500;i++){
              previousVy=f.vy;updateFighter(f,dt);time+=dt;height=Math.max(height,baseY-f.y);
              if(previousVy<0&&f.vy>=0){
                if(!apexTime)apexTime=time;
                if(extra&&f.jumps>0&&jump(f))airUsed++;
              }
              if(f.grounded)break;
            }
            const landed=f.grounded,remaining=f.jumps;
            f.grounded=false;f.coyote=0;f.jumps=0;const exhaustedJump=jump(f);
            paused=true;
            return {key,height,time,apexTime,airUsed,initialJump,landed,remaining,exhaustedJump,airJumps:f.airJumps,baseJump:f.jump,gravity:f.gravity};
          },
          horizontal(key){
            running=true;paused=false;countdown=0;clearInputs();
            Object.assign(player,fighter(roster[key],600,1));
            const remote=fighter(roster[key],600,1),ai=fighter(roster[key],600,1,true);
            for(const f of [player,remote,ai]){f.grounded=false;f.y=350;f.vy=0;f.vx=0;f.aiTimer=999;}
            keys.add('KeyD');playerControl(1/120);keys.clear();
            remoteInput={left:false,right:true,guard:false,down:false,attack:false,jumpSeq:0,attackSeq:0,specialSeq:0};
            remoteActions={jumpSeq:0,attackSeq:0,specialSeq:0};applyRemoteControl(remote,1/120);
            aiControl(ai,{x:1200,y:350},1/120);
            paused=true;
            return {local:player.vx,remote:remote.vx,ai:ai.vx,old:player.accel*.68/120,speed:player.speed};
          },
          gravity(){
            running=true;paused=false;countdown=0;
            const f=fighter(roster.arc,600,1);f.grounded=false;f.y=200;f.vy=50;
            updateFighter(f,1/120);const falling=f.vy;
            f.vy=-500;f.stun=.5;updateFighter(f,1/120);const stunned=f.vy;
            paused=true;return {falling,stunned,g:f.gravity};
          },
          melee(key,facing,combo){
            running=true;paused=false;countdown=0;
            const a=fighter(roster[key],650,facing),b=fighter(roster[key],650+facing*120,-facing);
            a.comboStep=combo-1;a.comboWindow=combo>1?.5:0;melee(a);a.attackTimer=a.attackDuration*.5;
            const contact=resolveMelee(a,b);if(contact)hit(...contact);
            paused=true;return {damage:b.damage,vx:b.vx,combo:a.comboStep};
          },
          arcPixels(combo){
            const images=[];
            for(const facing of [1,-1]){
              const c=document.createElement('canvas');c.width=480;c.height=360;
              const f=fighter(roster.arc,174,facing);f.y=105;f.comboStep=combo;f.attackDuration=.3;f.attackTimer=.15;
              drawMeleeArc(c.getContext('2d'),f);images.push(c.getContext('2d').getImageData(0,0,480,360).data);
            }
            let error=0,weight=0,left=0,right=0;
            for(let y=0;y<360;y++)for(let x=0;x<480;x++){
              const a=images[0][(y*480+x)*4+3],b=images[1][(y*480+(479-x))*4+3];
              error+=Math.abs(a-b);weight+=a;right+=a*(x+.5);left+=b*(479-x+.5);
            }
            return {mirrorError:error/weight,right:right/weight,left:left/weight};
          },
          pose(facing){
            clearInputs();countdown=0;running=true;paused=true;
            Object.assign(player,fighter(roster.arc,700,facing));
            player.comboStep=2;player.attackDuration=.25;player.attackTimer=.125;
            cpu.eliminated=true;particles.length=afterimages.length=projectiles.length=impactRings.length=damageTexts.length=0;
            draw(1000);
          },
          ready(){
            clearInputs();running=true;paused=false;countdown=0;demoMode=false;onlineMode=false;
            resetFighter(player,true);resetFighter(cpu,true);player.x=600;cpu.x=1350;cpu.aiTimer=999;
          },
          state:()=>({facing:player.facing,attackTimer:player.attackTimer,y:player.y,grounded:player.grounded}),
        };
      `});
    });
    await page.goto(url,{waitUntil:'networkidle'});
    await page.locator('#title-start-button:not([disabled])').click();
    await page.locator('#title-screen').waitFor({state:'hidden'});
    await page.locator('#start-button:not([disabled])').click();
    const jumps=[];
    for(const key of ['arc','jet','mist','brick','spring']) {
      const jump=await page.evaluate(key=>window.__movementTest.sampleJump(key),key);
      const oldHeight=jump.baseJump**2/(2*jump.gravity);
      const ratio=jump.height/oldHeight;
      assert(ratio>1.30&&ratio<1.36,`${key}: jump height must rise about one third, got ${ratio}`);
      assert(jump.initialJump&&jump.landed&&!jump.exhaustedJump);
      assert.equal(jump.remaining,jump.airJumps,'Landing restores the original air-jump count');
      const multi=await page.evaluate(key=>window.__movementTest.sampleJump(key,true),key);
      assert.equal(multi.airUsed,jump.airJumps);assert(multi.landed&&!multi.exhaustedJump);
      const horizontal=await page.evaluate(key=>window.__movementTest.horizontal(key),key);
      assert.equal(horizontal.local,horizontal.remote);assert.equal(horizontal.local,horizontal.ai);
      assert(horizontal.local>horizontal.old*1.2,'Air control should be more responsive for every player');
      for(const facing of [1,-1])for(const combo of [1,2,3]) {
        const hit=await page.evaluate(({key,facing,combo})=>window.__movementTest.melee(key,facing,combo),{key,facing,combo});
        assert(hit.damage>0);assert.equal(Math.sign(hit.vx),facing);assert.equal(hit.combo,combo);
      }
      jumps.push({key,before:Math.round(oldHeight),after:Math.round(jump.height),airJumps:multi.airUsed});
    }
    const gravity=await page.evaluate(()=>window.__movementTest.gravity());
    assert(Math.abs(gravity.falling-(50+gravity.g/120))<1e-8,'Falling gravity stays unchanged');
    assert(Math.abs(gravity.stunned-(-500+gravity.g/120))<1e-8,'Hit-stun gravity stays unchanged');
    for(const combo of [1,2,3]) {
      const arc=await page.evaluate(combo=>window.__movementTest.arcPixels(combo),combo);
      assert(arc.mirrorError<.03,`Canvas arcs should mirror, error: ${arc.mirrorError}`);
      assert(arc.left<200&&arc.right>280,'Slash must be on the facing side');
    }
    for(const facing of [1,-1]) {
      await page.evaluate(facing=>window.__movementTest.pose(facing),facing);
      await page.screenshot({path:`/private/tmp/skybreak-melee-${mobile?'phone':'desktop'}-${facing>0?'right':'left'}.png`});
    }
    await page.evaluate(()=>window.__movementTest.ready());
    await page.keyboard.press('ArrowLeft');
    if(mobile)await page.locator('[data-action="attack"]').tap();else await page.keyboard.press('KeyJ');
    assert.equal((await page.evaluate(()=>window.__movementTest.state())).facing,-1);
    await page.waitForFunction(()=>window.__movementTest.state().attackTimer>0);
    if(mobile)await page.locator('[data-action="jump"]').tap();else await page.keyboard.press('Space');
    await page.waitForFunction(()=>!window.__movementTest.state().grounded);
    results.push({mode:mobile?'phone':'desktop',jumps,checks:'5 fighters, original air-jump counts, landing, local/remote/CPU air control, 3 combos both directions, mirrored Canvas pixels, real A/X or J/Space input'});
    await context.close();
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close();}
