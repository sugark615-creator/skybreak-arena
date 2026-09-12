import './polish.css';
import { loadPoseSheets, drawPose, frameFor, posePortrait } from './sprite-animation.js';
import { drawSkyBackground, drawSkyPlatforms } from './sky-stage.js';
import { createBattleAudio } from './battle-audio.mjs';

const canvas = document.querySelector('#arena');
const ctx = canvas.getContext('2d');
const WORLD = { width: 1600, height: 900 };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const shell = document.querySelector('#game-shell');
const audio = createBattleAudio();
const $ = id => document.getElementById(id);
const ui = {
  timer: $('timer'), playerDamage: $('player-damage'), cpuDamage: $('cpu-damage'),
  playerStocks: $('player-stocks'), cpuStocks: $('cpu-stocks'),
  playerShield: $('player-shield'), cpuShield: $('cpu-shield'),
  ultimateMeter: $('ultimate-meter'), ultimateValue: $('ultimate-value'),
  cpuUltimateMeter: $('cpu-ultimate-meter'), cpuUltimateValue: $('cpu-ultimate-value'),
  specialButton: document.querySelector('[data-action="special"]'),
  playerName: $('player-name'), cpuName: $('cpu-name'), playerSwatch: $('player-swatch'), cpuSwatch: $('cpu-swatch'),
  callout: $('center-callout'), start: $('start-screen'), result: $('result-screen'), pause: $('pause-screen'),
  startButton: $('start-button'), demoButton: $('demo-button'), pauseButton: $('pause-button'), fullscreenButton: $('fullscreen-button'), soundButton: $('sound-button'),
};
function loadImage(src) { const image = new Image(); image.src = src; return image; }
const sprites = {
  arc: loadImage(new URL('./assets/arc-poses-v2.png', import.meta.url).href),
  jet: loadImage(new URL('./assets/jet-poses-v2.png', import.meta.url).href),
  mist: loadImage(new URL('./assets/mist-poses-v2.png', import.meta.url).href),
  brick: loadImage(new URL('./assets/brick-fighter.png', import.meta.url).href),
  spring: loadImage(new URL('./assets/spring-fighter.png', import.meta.url).href),
};
const poseUrls={
  arc:{src:new URL('./assets/arc-poses-v2.png',import.meta.url).href,grid:true},
  jet:{src:new URL('./assets/jet-poses-v2.png',import.meta.url).href,grid:true},
  mist:{src:new URL('./assets/mist-poses-v2.png',import.meta.url).href,grid:true},
  brick:new URL('./assets/brick-poses-v1.png',import.meta.url).href,
  spring:new URL('./assets/spring-poses-v1.png',import.meta.url).href,
};
const roster = {
  arc: {name:'ARC', color:'#ffd62e', accent:'#fff5a8', width:132,height:150,spriteFacing:1,
    speed:460,accel:2700,jump:700,gravity:1850,airJumps:1,power:1,weight:1,
    normalName:'THUNDER SHOT',maxName:'MAX THUNDER',shot:'spark',cooldown:.62,shotSpeed:720,shotDamage:8,
    description:'雷を宿す結晶ゴーレム。電撃と近接技を扱いやすい。',stats:[4,3,3]},
  jet: {name:'JET', color:'#65a8ff', accent:'#d8edff',width:128,height:178,spriteFacing:1,
    speed:550,accel:3300,jump:675,gravity:1950,airJumps:1,power:.85,weight:.9,
    normalName:'PLASMA SHOT',maxName:'STAR LASER',shot:'laser',cooldown:.46,shotSpeed:1050,shotDamage:6,
    description:'仮面のエアスケーター。最速のダッシュと連射で攻める。',stats:[5,2,3]},
  mist: {name:'MIST',color:'#55d6ce',accent:'#c6fff4',width:145,height:132,spriteFacing:1,
    speed:370,accel:2200,jump:610,gravity:1250,airJumps:3,power:.9,weight:.82,
    normalName:'STAR SHOT',maxName:'STAR CRASH',shot:'star',cooldown:.75,shotSpeed:590,shotDamage:9,
    description:'雲を操る精霊。空中でさらに3回跳び、ふわりと復帰する。',stats:[2,3,5]},
  brick: {name:'BRICK',color:'#ff5549',accent:'#ffd18f',width:150,height:168,spriteFacing:1,
    speed:340,accel:2200,jump:620,gravity:2100,airJumps:1,power:1.35,weight:1.3,
    normalName:'BOLT SHOT',maxName:'FURNACE BREAK',shot:'fire',cooldown:.92,shotSpeed:530,shotDamage:12,
    description:'一撃が重く、吹き飛びにくい。接近してパワーで押し切る。',stats:[2,5,2]},
  spring: {name:'SPRING',color:'#54d96b',accent:'#d9ffb8',width:132,height:178,spriteFacing:1,
    speed:490,accel:3000,jump:840,gravity:1770,airJumps:1,power:.92,weight:.93,
    normalName:'WIND SHOT',maxName:'SKY CYCLONE',shot:'wind',cooldown:.65,shotSpeed:740,shotDamage:7,
    description:'高く跳び、すばやく着地。上下の動きで相手を翻弄する。',stats:[4,3,5]},
};
for (const [key, config] of Object.entries(roster)) Object.assign(config,{key,sprite:sprites[key]});
const platforms = [{x:90,y:690,width:1420,height:42,main:true}];
const keys = new Set();
const held = {left:false,right:false,guard:false,attack:false};
const pointerHolds = new Map();
const particles = [], projectiles = [], afterimages = [], impactRings = [], damageTexts = [];
let running=false,paused=false,matchTime=180,lastTime=performance.now(),accumulator=0,simTime=0;
let calloutTimer,resultTimer,screenShake=0,hitStop=0,countdown=0,countdownCue=0,jumpBuffer=0,attackBuffer=0;
let selectedCharacter='arc',assetsReady=false,bgmMuted=false,volume=.6,aiTimer=0,demoMode=false;
let matchStats={hits:0,damage:0,max:0};
const settings = {difficulty:'normal',opponent:'auto'};
function readPreferences() {
  try { const p=JSON.parse(localStorage.getItem('skybreak-preferences-v2') || '{}');
    const legacy={volt:'arc',rift:'jet',kirby:'mist'};
    p.character=legacy[p.character]||p.character;p.opponent=legacy[p.opponent]||p.opponent;
    if (roster[p.character]) selectedCharacter=p.character;
    if (['easy','normal','hard'].includes(p.difficulty)) settings.difficulty=p.difficulty;
    if (p.opponent==='auto' || roster[p.opponent]) settings.opponent=p.opponent;
    if (Number.isFinite(p.volume)) volume=Math.max(0,Math.min(1,p.volume));
    bgmMuted=p.muted===true;
  } catch {}
}
function savePreferences() {
  try { localStorage.setItem('skybreak-preferences-v2',JSON.stringify({...settings,character:selectedCharacter,volume,muted:bgmMuted})); } catch {}
}
function fighter(config,startX,baseFacing,ai=false) {
  return {...config,startX,baseFacing,ai,x:startX,y:690-config.height,vx:0,vy:0,damage:0,ultimate:0,stocks:3,shield:100,
    grounded:true,airTime:0,launchTimer:0,jumps:config.airJumps,coyote:0,facing:baseFacing,attackCooldown:0,specialCooldown:0,aiTimer:.2,
    attackTimer:0,attackDuration:.3,comboStep:0,comboWindow:0,attackHasHit:false,stun:0,guard:false,
    respawn:0,invincible:0,eliminated:false,flash:0,motionPhase:0,landTimer:0,specialTimer:0,specialDuration:.4,trailCooldown:0};
}
const player=fighter(roster.arc,430,1), cpu=fighter(roster.jet,1050,-1,true),fighters=[player,cpu];
function applyCharacter(target,key) { Object.assign(target,roster[key]); target.y=690-target.height; }
function refreshOpponent(randomize=false) {
  let key=settings.opponent;
  if (key==='auto') {
    const options=Object.keys(roster).filter(k=>k!==selectedCharacter);
    key=randomize?options[Math.floor(Math.random()*options.length)]:selectedCharacter==='jet'?'arc':'jet';
  }
  applyCharacter(cpu,key);
  ui.cpuName.textContent=cpu.name;
  ui.cpuSwatch.style.background=cpu.color;
  document.querySelector('.cpu-card').style.setProperty('--fighter',cpu.color);
  ui.startButton.querySelector('small').textContent=player.name+' VS '+(settings.opponent==='auto'?'CPU':cpu.name);
}
function selectCharacter(key) {
  if (!roster[key] || running) return;
  selectedCharacter=key;applyCharacter(player,key);refreshOpponent();
  ui.playerName.textContent=player.name;ui.playerSwatch.style.background=player.color;
  ui.start.style.setProperty('--selected',player.color);
  document.querySelector('.player-card').style.setProperty('--fighter',player.color);
  $('selected-title').textContent=player.name;$('selected-description').textContent=player.description;
  $('normal-move').textContent=player.normalName;$('max-move').textContent=player.maxName;
  const stats=$('character-stats');stats.replaceChildren();
  ['スピード','パワー','ジャンプ'].forEach((name,index)=>{
    const row=document.createElement('div');row.className='stat';row.setAttribute('aria-label',name+' '+player.stats[index]+'/5');
    const label=document.createElement('span');label.textContent=name;row.append(label);
    const track=document.createElement('span');track.className='stat-track';track.setAttribute('aria-hidden','true');
    for(let i=0;i<5;i++){const bar=document.createElement('i');bar.classList.toggle('filled',i<player.stats[index]);track.append(bar);}
    row.append(track);stats.append(row);
  });
  document.querySelectorAll('[data-character]').forEach(button=>{
    const active=button.dataset.character===key;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));
  });
  updateHud();savePreferences();
}
function resize() {
  const width=window.visualViewport?.width||innerWidth,height=window.visualViewport?.height||innerHeight,dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=Math.floor(width*dpr);canvas.height=Math.floor(height*dpr);
  canvas.style.width=width+'px';canvas.style.height=height+'px';
  if(running && matchMedia('(pointer: coarse) and (orientation: portrait)').matches) setPaused(true);
}
function haptic(duration=12) { if(!reducedMotion)try{navigator.vibrate?.(duration);}catch{} }
function beep(freq,duration,type='sine',gain=.035) { audio.sfx(freq,duration,type,gain); }
function startBgm(){audio.start();}
function stopBgm(){audio.stop();}
function soundUi() {
  ui.soundButton.textContent=bgmMuted?'♪̸':'♪';ui.soundButton.setAttribute('aria-label',bgmMuted?'音をオンにする':'音をミュート');
  ui.soundButton.setAttribute('aria-pressed',String(bgmMuted));audio.setMuted(bgmMuted);audio.setVolume(volume);
}
async function enterMobilePlayMode() {
  if(!assetsReady || running) return;
  void audio.unlock(); // Keep user activation before fullscreen awaits.
  if(matchMedia('(pointer: coarse)').matches){
    try{if(!document.fullscreenElement && shell.requestFullscreen)await shell.requestFullscreen({navigationUI:'hide'});}catch{}
    try{if(screen.orientation?.lock)await screen.orientation.lock('landscape');}catch{}
  }
  resetMatch();
}
async function enterDemoMode(){
  if(!assetsReady||running)return;
  void audio.unlock();
  if(matchMedia('(pointer: coarse)').matches){
    try{if(!document.fullscreenElement&&shell.requestFullscreen)await shell.requestFullscreen({navigationUI:'hide'});}catch{}
    try{if(screen.orientation?.lock)await screen.orientation.lock('landscape');}catch{}
  }
  resetMatch(true);
}
async function toggleFullscreen(){
  try{if(document.fullscreenElement)await document.exitFullscreen();else await shell.requestFullscreen?.({navigationUI:'hide'});}catch{}
}
function announce(text,seconds=.7) {
  ui.callout.textContent=text;ui.callout.classList.add('show');clearTimeout(calloutTimer);
  calloutTimer=setTimeout(()=>ui.callout.classList.remove('show'),seconds*1000);
}
function clearInputs(){
  keys.clear();Object.keys(held).forEach(k=>held[k]=false);jumpBuffer=0;attackBuffer=0;
  pointerHolds.forEach(active=>active.clear());
  fighters.forEach(f=>f.guard=false);document.querySelectorAll('.pressed').forEach(b=>b.classList.remove('pressed'));
}
function resetFighter(f,full=false){
  Object.assign(f,{x:f.startX,y:full?690-f.height:220,vx:0,vy:0,damage:0,shield:100,grounded:full,
    jumps:f.airJumps,airTime:0,launchTimer:0,coyote:0,facing:f.baseFacing,attackCooldown:0,specialCooldown:0,attackTimer:0,comboStep:0,aiTimer:.1+Math.random()*.15,
    comboWindow:0,attackHasHit:false,landTimer:0,specialTimer:0,specialDuration:.4,trailCooldown:0,stun:0,guard:false,
    respawn:full?0:.65,invincible:full?0:1.8,eliminated:false,flash:0});
  if(full) f.ultimate=0;
}
function setPlaySurfaces(enabled){
  document.querySelector('.topbar').inert=!enabled;
  document.querySelector('.touch-controls').inert=!enabled||demoMode;
}
function refreshDemoFighters(){
  const choices=Object.keys(roster).sort(()=>Math.random()-.5);
  applyCharacter(player,choices[0]);applyCharacter(cpu,choices[1]);
  for(const [f,prefix] of [[player,'player'],[cpu,'cpu']]){
    ui[prefix+'Name'].textContent=f.name;ui[prefix+'Swatch'].style.background=f.color;
    document.querySelector('.'+prefix+'-card').style.setProperty('--fighter',f.color);
  }
}
function setModeUi(){
  $('player-role').textContent=demoMode?'CPU 1':'YOU';$('cpu-role').textContent=demoMode?'CPU 2':'CPU';
  shell.classList.toggle('demo-mode',demoMode);
}
function resetMatch(asDemo=false){
  clearTimeout(resultTimer);clearTimeout(calloutTimer);clearInputs();demoMode=asDemo;
  if(demoMode)refreshDemoFighters();else refreshOpponent(true);setModeUi();
  running=true;paused=false;matchTime=180;accumulator=0;lastTime=performance.now();countdown=2.4;countdownCue=3;hitStop=0;aiTimer=.6;
  matchStats={hits:0,damage:0,max:0};
  fighters.forEach(f=>{f.stocks=3;resetFighter(f,true);});
  particles.length=projectiles.length=afterimages.length=impactRings.length=damageTexts.length=0;
  [ui.start,ui.result,ui.pause].forEach(el=>el.classList.remove('visible'));shell.classList.remove('in-menu');
  setPlaySurfaces(true);ui.pauseButton.textContent='Ⅱ';ui.pauseButton.setAttribute('aria-label','一時停止');
  document.activeElement?.blur();announce('3',.8);beep(320,.12,'triangle',.05);startBgm();updateHud();resize();
}
function showMenu(){
  running=false;paused=false;countdown=0;clearTimeout(resultTimer);clearTimeout(calloutTimer);clearInputs();stopBgm();
  projectiles.length=particles.length=afterimages.length=damageTexts.length=impactRings.length=0;
  ui.result.classList.remove('visible');ui.pause.classList.remove('visible');ui.start.classList.add('visible');ui.callout.classList.remove('show');
  demoMode=false;shell.classList.remove('demo-mode');shell.classList.add('in-menu');setModeUi();setPlaySurfaces(false);selectCharacter(selectedCharacter);
  document.querySelector('[data-character="'+selectedCharacter+'"]').focus();
}
function setPaused(value){
  if(!running || paused===value)return;
  paused=value;clearInputs();accumulator=0;lastTime=performance.now();ui.pause.classList.toggle('visible',paused);
  ui.pauseButton.textContent=paused?'▶':'Ⅱ';ui.pauseButton.setAttribute('aria-label',paused?'再開':'一時停止');
  setPlaySurfaces(!paused);if(paused){audio.pause();clearTimeout(calloutTimer);ui.callout.classList.remove('show');$('resume-button').focus();}
  else {void audio.unlock();audio.resume();document.activeElement?.blur();}
}
function canAct(f){return running&&!paused&&countdown<=0&&f.stun<=0&&f.respawn<=0&&!f.eliminated;}
function jump(f){
  if(!canAct(f))return false;
  const fromGround=f.grounded||f.coyote>0;
  if(f.grounded || f.coyote>0){f.vy=-f.jump;f.coyote=0;}
  else if(f.jumps>0){f.vy=-f.jump*.9;f.jumps--;}
  else return false;
  if(fromGround)f.airTime=0;
  f.launchTimer=.18;f.landTimer=0;f.grounded=false;
  if(!fromGround)impactRings.push({x:f.x+f.width/2,y:f.y+f.height,radius:18,life:.18,color:'#e9faff'});
  burst(f.x+f.width/2,f.y+f.height,f.color,5);beep(f===player?420:280,.075,'triangle',.02);return true;
}
function melee(f){
  if(!canAct(f)||f.guard||f.attackCooldown>0||f.specialTimer>.12)return false;
  f.comboStep=f.comboWindow>0?(f.comboStep%3)+1:1;f.comboWindow=.65;
  f.attackDuration=f.comboStep===3?.38:.25;f.attackTimer=f.attackDuration;
  f.attackCooldown=f.attackDuration+(f.comboStep===3?.11:0);f.attackHasHit=false;f.vx+=f.facing*(f.comboStep===3?140:65);
  audio.combat('swing');return true;
}
function charge(f,amount){
  const was=f.ultimate;f.ultimate=Math.min(100,Math.max(0,f.ultimate+amount));
  if(was<100&&f.ultimate>=100&&f===player){announce('MAX READY',.8);beep(820,.18,'triangle',.05);haptic(20);}
}
function special(f){
  if(!canAct(f)||f.guard||f.specialCooldown>0||f.attackTimer>0)return false;
  const maximum=f.ultimate>=100;
  if(maximum){f.ultimate=0;if(f===player)matchStats.max++;}
  f.specialCooldown=maximum?1.4:f.cooldown;f.specialDuration=maximum?.7:.28;f.specialTimer=f.specialDuration;
  const dir=f.facing;const x=f.x+f.width/2+dir*(f.width*.5+10),y=f.y+f.height*.48;
  const spreads=maximum&&f.key==='mist'?[-.25,0,.25]:[0];
  for(const angle of spreads){
    projectiles.push({owner:f,type:f.shot,maximum,x,y,previousX:x,vx:dir*(maximum?f.shotSpeed*1.08:f.shotSpeed)*Math.cos(angle),
      vy:Math.sin(angle)*480,radius:maximum?(f.key==='jet'?32:48):(f.key==='brick'?25:18),
      damage:maximum?(f.key==='mist'?15:28*f.power):f.shotDamage,
      force:maximum?750*f.power:340,lift:maximum?-360:-160,direction:dir,
      life:maximum?1.9:1.55,color:f.color});
  }
  f.vx-=dir*(maximum?170:35);burst(x,y,f.color,maximum?24:7);
  if(maximum){announce(f.maxName+'!',1);screenShake=12;impactRings.push({x:f.x+f.width/2,y:f.y+f.height/2,radius:25,life:.65,color:f.color});haptic(35);}
  audio.combat(maximum?'launch':'shot');updateHud();return true;
}
function playerControl(dt){
  if(!canAct(player))return;
  const direction=(keys.has('KeyD')||keys.has('ArrowRight')||held.right?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')||held.left?1:0);
  player.guard=(keys.has('KeyL')||held.guard)&&player.shield>0&&player.attackTimer<=0&&player.specialTimer<=0;
  if(direction){player.vx+=direction*player.accel*(player.grounded?1:.68)*dt;player.facing=direction;}
  if((keys.has('KeyS')||keys.has('ArrowDown'))&&!player.grounded)player.vy+=1000*dt;
  if(jumpBuffer>0&&jump(player))jumpBuffer=0;
  if((attackBuffer>0||held.attack||keys.has('KeyJ'))&&melee(player))attackBuffer=0;
}
function aiControl(f,target,dt){
  if(!canAct(f))return;
  const dx=target.x-f.x,dy=target.y-f.y,cx=f.x+f.width/2;
  const recovering=cx<140||cx>1460||f.y+f.height>720;
  const goal=recovering?800-cx:dx;
  f.facing=Math.sign(goal)||f.facing;
  if(Math.abs(goal)>115)f.vx+=Math.sign(goal)*f.accel*(f.grounded?.83:.7)*dt;
  f.aiTimer-=dt;
  if(f.aiTimer>0)return;
  const tune={easy:{interval:.42,attack:.52,guard:.08},normal:{interval:.24,attack:.78,guard:.24},hard:{interval:.15,attack:.94,guard:.48}}[settings.difficulty];
  f.aiTimer=tune.interval+Math.random()*.08;
  f.guard=!recovering&&f.attackTimer<=0&&f.specialTimer<=0&&f.shield>25&&Math.abs(dx)<220&&target.attackTimer>0&&Math.random()<tune.guard;
  if(recovering&&!f.grounded&&f.vy>-100){jump(f);return;}
  if(dy<-120&&Math.abs(dx)<350)jump(f);
  if(Math.abs(dx)<150&&Math.abs(dy)<110&&Math.random()<tune.attack)melee(f);
  else if(Math.abs(dx)>160&&Math.abs(dx)<820&&Math.abs(dy)<90&&Math.random()<tune.attack*.7)special(f);
}
function floorFor(f,oldBottom){
  if(f.vy<0)return null;
  return platforms.find(p=>f.x+f.width*.8>p.x&&f.x+f.width*.2<p.x+p.width&&oldBottom<=p.y+8&&f.y+f.height>=p.y)||null;
}
function updateFighter(f,dt){
  f.launchTimer=Math.max(0,f.launchTimer-dt);
  for(const key of ['attackCooldown','specialCooldown','attackTimer','comboWindow','stun','respawn','invincible','flash','landTimer','specialTimer','trailCooldown','coyote'])f[key]=Math.max(0,f[key]-dt);
  f.motionPhase+=dt*(2.4+Math.abs(f.vx)/34);
  if(f.eliminated)return;
  if(f.respawn>0){f.vx=0;f.vy=0;return;}
  if(f.guard){
    f.shield=Math.max(0,f.shield-19*dt);f.vx*=Math.exp(-12*dt);
    if(f.shield<=0){f.guard=false;f.stun=1.3;announce('GUARD BREAK',.65);}
  }else f.shield=Math.min(100,f.shield+12*dt);
  const wasGrounded=f.grounded,oldBottom=f.y+f.height;
  if(wasGrounded)f.coyote=.1;
  f.vy+=f.gravity*dt;
  f.vx*=Math.exp(-(f.stun>0?1.1:f.grounded?5:1.1)*dt);
  if(f.stun<=0){const max=f.guard?85:f.speed;f.vx=Math.max(-max,Math.min(max,f.vx));}
  f.x+=f.vx*dt;f.y+=f.vy*dt;
  const floor=floorFor(f,oldBottom);
  if(floor){const impact=f.vy;f.y=floor.y-f.height;f.vy=0;f.grounded=true;f.jumps=f.airJumps;
    if(!wasGrounded&&impact>250){f.landTimer=.2;burst(f.x+f.width/2,floor.y,'#c4d9ea',5);}
  }else f.grounded=false;
  f.airTime=f.grounded?0:f.airTime+dt;
  if(Math.abs(f.vx)>390&&f.trailCooldown<=0&&!reducedMotion){
    afterimages.push({key:f.key,poseOverride:frameFor(f),grounded:f.grounded,x:f.x,y:f.y,width:f.width,height:f.height,facing:f.facing,color:f.color,life:.14});
    f.trailCooldown=.07;if(afterimages.length>16)afterimages.shift();
  }
  if(f.x< -200||f.x>WORLD.width+200||f.y>WORLD.height+180||f.y< -440)ringOut(f);
}
function resolveMelee(attacker,target){
  if(!canAct(attacker)||attacker.guard||attacker.attackHasHit||attacker.attackTimer<=0||target.respawn>0||target.eliminated)return;
  const progress=1-attacker.attackTimer/attacker.attackDuration;
  if(progress<.22||progress>.76)return;
  const dx=target.x+target.width/2-attacker.x-attacker.width/2,dy=target.y+target.height*.5-attacker.y-attacker.height*.5;
  const reach=(attacker.comboStep===3?170:145)+(attacker.key==='brick'?12:0);
  if(Math.abs(dx)>reach||Math.abs(dy)>Math.max(100,(target.height+attacker.height)*.32)||Math.sign(dx||attacker.facing)!==attacker.facing)return;
  attacker.attackHasHit=true;
  const combo=[null,{damage:5,force:200,lift:-120},{damage:7,force:240,lift:-140},{damage:12,force:530,lift:-310}][attacker.comboStep];
  return [target,attacker,combo.damage*attacker.power,combo.force*attacker.power,combo.lift,attacker.facing,false];
}
function hit(target,attacker,damage,force,lift,direction,maximum=false){
  if(!running||paused||target.invincible>0||target.respawn>0||target.eliminated)return false;
  if(target.guard&&target.shield>0){
    target.shield=Math.max(0,target.shield-damage*2.7);target.vx+=direction*force*.14;
    if(!maximum)charge(attacker,damage*.6);charge(target,damage*.5);
    burst(target.x+target.width/2,target.y+target.height/2,'#b5f5ff',6);beep(130,.08,'triangle',.03);
    if(target.shield===0){target.guard=false;target.stun=1.3;announce('GUARD BREAK',.65);}return true;
  }
  target.damage=Math.min(999,target.damage+damage);
  const scale=(1+target.damage/100)/target.weight;
  target.vx=direction*force*scale;target.vy=lift*scale;target.grounded=false;target.coyote=0;
  target.stun=Math.min(.65,.18+damage*.012);target.attackTimer=0;target.specialTimer=0;target.flash=.12;
  if(!maximum)charge(attacker,damage*1.6);charge(target,damage*.85);
  if(attacker===player){matchStats.hits++;matchStats.damage+=damage;}
  hitStop=Math.max(hitStop,maximum?.055:damage>=12?.018:0);screenShake=Math.min(8,maximum?8:2+damage*.17);
  const x=target.x+target.width/2,y=target.y+target.height*.4;
  burst(x,y,attacker.color,maximum?22:10);impactRings.push({x,y,radius:12,life:.24,color:maximum?'#fff':attacker.color});
  damageTexts.push({x,y:y-45,text:'+'+Math.round(damage),life:.65,color:attacker.color});
  audio.combat(maximum?'maximum':damage>=12?'heavy':'hit');if(target===player)haptic(12);return true;
}
function ringOut(f){
  if(!running||f.respawn>0||f.eliminated)return;
  f.stocks--;screenShake=14;burst(Math.max(50,Math.min(1550,f.x)),Math.min(850,f.y),f.color,24);
  announce('RING OUT!',.85);beep(75,.4,'sawtooth',.06);
  if(f.stocks<=0){f.eliminated=true;}
  else resetFighter(f);
}
function finishMatch(playerWon){
  if(!running)return;
  running=false;paused=false;countdown=0;clearInputs();projectiles.length=0;stopBgm();
  const winner=playerWon===null?null:playerWon?player:cpu;
  $('result-title').textContent=playerWon===null?'DRAW':demoMode?winner.name+' WINS':playerWon?'VICTORY':'DEFEAT';$('result-title').style.color=winner?.color||'#b9d3ec';
  $('result-copy').textContent=playerWon===null?'引き分け。もう一戦！':demoMode?'CPU同士のデモ対戦は'+winner.name+'の勝利！':playerWon?player.name+'の勝利！':cpu.name+'の勝利。もう一度挑戦しよう。';
  const stats=$('result-stats');stats.replaceChildren();
  const resultRows=demoMode?[['CPU 1 ヒット',matchStats.hits],['CPU 1 ダメージ',Math.round(matchStats.damage)+'%'],['CPU 1 MAX',matchStats.max]]:[['ヒット数',matchStats.hits],['与えたダメージ',Math.round(matchStats.damage)+'%'],['MAX発動',matchStats.max]];
  resultRows.forEach(([name,value])=>{
    const span=document.createElement('span');span.textContent=name;const b=document.createElement('b');b.textContent=value;span.append(b);stats.append(span);
  });
  resultTimer=setTimeout(()=>{ui.result.classList.add('visible');setPlaySurfaces(false);$('restart-button').focus();},550);
  beep(demoMode||playerWon?690:110,.6,demoMode||playerWon?'triangle':'sawtooth',.07);
}
function burst(x,y,color,count){
  for(let i=0;i<count;i++)particles.push({x,y,vx:(Math.random()-.5)*580,vy:(Math.random()-.6)*450,life:.25+Math.random()*.3,size:3+Math.random()*8,color});
  if(particles.length>160)particles.splice(0,particles.length-160);
}
function updateEffects(dt,combat=true){
  if(combat)for(let i=projectiles.length-1;i>=0;i--){
    const p=projectiles[i];p.previousX=p.x;p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;
    const t=p.owner===player?cpu:player;
    // Sweep the projectile radius across this simulation step to avoid tunneling.
    const left=Math.min(p.previousX,p.x)-p.radius,right=Math.max(p.previousX,p.x)+p.radius;
    const inside=right>=t.x&&left<=t.x+t.width&&p.y+p.radius>=t.y&&p.y-p.radius<=t.y+t.height;
    if(inside&&t.respawn<=0&&!t.eliminated){hit(t,p.owner,p.damage,p.force,p.lift,p.direction,p.maximum);p.life=0;burst(p.x,p.y,p.color,8);}
    if(p.life<=0||p.x< -180||p.x>WORLD.width+180)projectiles.splice(i,1);
  }
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.vy+=900*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.life<=0)particles.splice(i,1);}
  for(const list of [afterimages,impactRings,damageTexts])for(let i=list.length-1;i>=0;i--){list[i].life-=dt;if(list===impactRings)list[i].radius+=360*dt;if(list===damageTexts)list[i].y-=70*dt;if(list[i].life<=0)list.splice(i,1);}
}

function drawAfterimages() {
  for (const ghost of afterimages) {
    ctx.save();
    ctx.globalAlpha = ghost.life * 1.7;
    ctx.globalCompositeOperation = 'screen';
    ctx.filter = 'saturate(1.8) brightness(1.25)';
    ctx.translate(ghost.x + ghost.width / 2, ghost.y + ghost.height / 2);
    ctx.scale(ghost.facing, 1);
    drawPose(ctx,ghost);
    ctx.restore();
  }
}

function drawFighter(f, time) {
  if (!f.sprite.complete || !f.sprite.naturalWidth) return;
  if (f.eliminated || (f.invincible > 0 && Math.floor(time / 70) % 2)) return;
  const attackProgress = f.attackTimer > 0 ? 1 - f.attackTimer / f.attackDuration : 0;
  const attackArc = f.attackTimer > 0 ? Math.sin(attackProgress * Math.PI) : 0;
  const bodyX=f.specialTimer>0?-f.facing*3:0;
  const bodyY=0;

  const ground=platforms.find(p=>f.x+f.width/2>=p.x&&f.x+f.width/2<=p.x+p.width&&f.y+f.height<=p.y+12);
  if(ground){
  const altitude=Math.max(0,ground.y-f.y-f.height),shadowSize=Math.max(.32,1-altitude/620);
  ctx.save();
  ctx.globalAlpha = .23*shadowSize;
  ctx.fillStyle = '#050617';
  ctx.beginPath();
  ctx.ellipse(f.x + f.width / 2, ground.y+3, f.width*.42*shadowSize, 7*shadowSize, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  }

  if(f.ultimate>=100){
    ctx.save();ctx.globalAlpha=.35;ctx.strokeStyle=f.color;ctx.lineWidth=2;
    ctx.beginPath();ctx.ellipse(f.x+f.width/2,f.y+f.height+4,f.width*.6,10,0,0,Math.PI*2);ctx.stroke();ctx.restore();
  }

  ctx.save();
  ctx.translate(f.x + f.width / 2 + bodyX, f.y + f.height / 2 + bodyY);
  ctx.scale(f.facing, 1);
  if (f.flash > 0) {
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 35;
    ctx.globalAlpha = .58;
  }
  drawPose(ctx, f);
  ctx.restore();

  if (f.specialTimer > 0) {
    const pulse = 1 - f.specialTimer / f.specialDuration;
    ctx.save();
    ctx.globalAlpha = Math.sin(pulse * Math.PI) * .75;
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 7;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 28;
    ctx.beginPath();
    ctx.arc(f.x + f.width / 2, f.y + f.height / 2, 58 + pulse * 72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (f.guard && f.shield > 0) {
    ctx.save();
    ctx.strokeStyle = f.color;
    ctx.fillStyle = `${f.color}28`;
    ctx.lineWidth = 8;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.ellipse(f.x + f.width / 2, f.y + f.height / 2, f.width * .72, f.height * .67, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (f.attackTimer > 0) {
    const cx = f.x + f.width / 2 + f.facing * 38;
    const cy = f.y + f.height * .5;
    const start = f.facing > 0 ? -1.3 : Math.PI - 1.8;
    const end = start + f.facing * (1.1 + attackProgress * 1.55);
    ctx.save();
    ctx.strokeStyle = f.comboStep === 3 ? '#ffffff' : f.color;
    ctx.lineWidth = f.comboStep === 3 ? 24 : 15;
    ctx.globalAlpha = .3 + attackArc * .7;
    ctx.shadowColor = f.color;
    ctx.shadowBlur = 34;
    ctx.beginPath();
    ctx.arc(cx, cy, 92 + f.comboStep * 9, start, end, f.facing < 0);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSprite(f) {
  if(!f.sprite.naturalWidth)return;
  const height=f.height*1.13,width=height*f.sprite.naturalWidth/f.sprite.naturalHeight;
  ctx.drawImage(f.sprite,-width/2,f.height/2-height,width,height);
}
function drawEffects() {
  for(const p of projectiles){
    ctx.save();ctx.translate(p.x,p.y);ctx.shadowColor=p.color;ctx.shadowBlur=p.maximum?30:12;
    ctx.fillStyle=p.color;ctx.strokeStyle=p.maximum?'#fff':p.color;
    const r=p.radius;
    if(p.type==='laser'){
      ctx.scale(p.direction,1);ctx.fillRect(-r*2,-r*.32,r*3.4,r*.64);ctx.fillStyle='#fff';ctx.fillRect(-r,-r*.1,r*2.2,r*.2);
    }else if(p.type==='star'){
      ctx.rotate(simTime*5);ctx.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,l=i%2?r*.45:r;ctx.lineTo(Math.cos(a)*l,Math.sin(a)*l);}ctx.closePath();ctx.fill();
    }else if(p.type==='wind'){
      ctx.rotate(simTime*9);ctx.lineWidth=p.maximum?12:6;
      for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(0,0,r*(1-i*.23),i,Math.PI*1.45+i);ctx.stroke();}
    }else{
      ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff5c9';ctx.beginPath();ctx.arc(-p.direction*r*.15,-r*.15,r*.44,0,Math.PI*2);ctx.fill();
      if(p.type==='spark'){ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-r*.8,r*.2);ctx.lineTo(0,-r*.5);ctx.lineTo(-r*.1,r*.4);ctx.lineTo(r*.8,-r*.2);ctx.stroke();}
    }
    if(p.maximum){ctx.globalAlpha=.55;ctx.strokeStyle=p.color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,r*1.35,0,Math.PI*2);ctx.stroke();}
    ctx.restore();
  }
  for(const p of particles){ctx.globalAlpha=Math.min(1,p.life*3);ctx.fillStyle=p.color;ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);}
  for(const p of impactRings){ctx.globalAlpha=Math.min(.75,p.life*3);ctx.strokeStyle=p.color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(p.x,p.y,p.radius,0,Math.PI*2);ctx.stroke();}
  for(const p of damageTexts){ctx.globalAlpha=Math.min(1,p.life*4);ctx.fillStyle=p.color;ctx.font='900 26px system-ui';ctx.textAlign='center';ctx.fillText(p.text,p.x,p.y);}
  ctx.globalAlpha=1;
}

function draw(time) {
  const scale = Math.min(canvas.width / WORLD.width, canvas.height / WORLD.height);
  const offsetX = (canvas.width - WORLD.width * scale) / 2;
  const offsetY = (canvas.height - WORLD.height * scale) / 2;
  const shake = reducedMotion || paused ? 0 : screenShake * scale;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, offsetX + (Math.random() - .5) * shake, offsetY + (Math.random() - .5) * shake);
  drawSkyBackground(ctx,time);
  drawSkyPlatforms(ctx,platforms);
  drawAfterimages();
  drawFighter(player, time);
  drawFighter(cpu, time);
  drawEffects();
  for(const f of fighters){
    if(f.eliminated||f.respawn>0)continue;
    ctx.fillStyle=f===player?'#ffd62e':'#88b6f1';ctx.textAlign='center';ctx.font='900 15px system-ui';
    ctx.fillText(demoMode?(f===player?'CPU 1':'CPU 2'):f===player?'1P':'CPU',Math.max(25,Math.min(1575,f.x+f.width/2)),Math.max(30,f.y-30));
  }

}

function updateHud(){
  for(const [f,prefix] of [[player,'player'],[cpu,'cpu']]){
    $(prefix+'-damage').textContent=Math.round(f.damage);$(prefix+'-damage').style.color=f.damage>=100?'#ff706b':f.damage>=60?'#ffcc72':'#f4f6ff';
    $(prefix+'-stocks').textContent=Array(Math.max(0,f.stocks)).fill('◆').join(' ');
    $(prefix+'-stocks').setAttribute('aria-label','残りストック '+f.stocks);
    $(prefix+'-shield').style.width=f.shield+'%';
  }
  ui.ultimateMeter.style.width=player.ultimate+'%';ui.ultimateValue.textContent=player.ultimate>=100?'READY':Math.floor(player.ultimate)+'%';
  ui.cpuUltimateMeter.style.width=cpu.ultimate+'%';ui.cpuUltimateValue.textContent=cpu.ultimate>=100?'READY':Math.floor(cpu.ultimate)+'%';
  document.querySelector('.player-card').classList.toggle('max-ready',player.ultimate>=100);
  document.querySelector('.cpu-card').classList.toggle('max-ready',cpu.ultimate>=100);
  ui.specialButton.classList.toggle('ready',player.ultimate>=100);ui.specialButton.classList.toggle('cooldown',player.specialCooldown>0);
  ui.specialButton.setAttribute('aria-label',player.ultimate>=100?player.maxName+'を発動':'通常技 '+player.normalName);
  $('b-label').textContent=player.ultimate>=100?'MAX!':'ショット';
  ui.timer.textContent=String(Math.floor(matchTime/60)).padStart(2,'0')+':'+String(Math.floor(matchTime%60)).padStart(2,'0');
  ui.timer.classList.toggle('urgent',matchTime<=30);
}
function simulate(dt){
  if(!running||paused)return;
  simTime+=dt;screenShake=Math.max(0,screenShake-35*dt);
  if(countdown>0){countdown=Math.max(0,countdown-dt);const cue=Math.ceil(countdown/.8);
    if(cue!==countdownCue){countdownCue=cue;announce(cue>0?String(cue):'FIGHT!',cue>0?.8:.65);beep(cue>0?320:600,.1,'triangle',.05);}return;
  }
  matchTime=Math.max(0,matchTime-dt);
  if(matchTime<=0){const score=player.stocks*1000-player.damage-(cpu.stocks*1000-cpu.damage);finishMatch(score===0?null:score>0);return;}
  jumpBuffer=Math.max(0,jumpBuffer-dt);attackBuffer=Math.max(0,attackBuffer-dt);
  if(hitStop>0){hitStop=Math.max(0,hitStop-dt);return;}
  if(demoMode){aiControl(player,cpu,dt);aiControl(cpu,player,dt);}else{playerControl(dt);aiControl(cpu,player,dt);}
  for(const f of fighters){if(!running)return;updateFighter(f,dt);}
  if(fighters.some(f=>f.stocks<=0)){finishMatch(player.stocks<=0&&cpu.stocks<=0?null:cpu.stocks<=0);return;}
  if(!running)return;
  const contacts=[resolveMelee(player,cpu),resolveMelee(cpu,player)].filter(Boolean);
  for(const contact of contacts)hit(...contact);
  updateEffects(dt,true);
}
function tick(now){
  const elapsed=Math.min(.1,(now-lastTime)/1000);lastTime=now;
  if(running&&!paused){accumulator+=elapsed;while(accumulator>=1/120){simulate(1/120);accumulator-=1/120;}}
  else {accumulator=0;if(!paused)updateEffects(elapsed,false);}
  updateHud();draw(simTime*1000);requestAnimationFrame(tick);
}
function togglePause(){setPaused(!paused);}
const gameKeys=['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','KeyJ','KeyK','KeyL'];
addEventListener('keydown',event=>{
  if(event.code==='Escape'||event.code==='KeyP'){if(!event.repeat)togglePause();return;}
  if(!running||paused||countdown>0||demoMode)return;
  if(gameKeys.includes(event.code))event.preventDefault();
  if(!event.repeat&&!keys.has(event.code)){
    if(['Space','KeyW','ArrowUp'].includes(event.code))jumpBuffer=.16;
    if(event.code==='KeyJ')attackBuffer=.18;
    if(event.code==='KeyK')special(player);
  }
  keys.add(event.code);
});
addEventListener('keyup',event=>keys.delete(event.code));
document.querySelectorAll('[data-hold]').forEach(button=>{
  const name=button.dataset.hold,active=new Set();
  pointerHolds.set(name,active);
  button.addEventListener('pointerdown',event=>{event.preventDefault();if(!running||paused||demoMode)return;active.add(event.pointerId);held[name]=true;button.classList.add('pressed');try{button.setPointerCapture(event.pointerId);}catch{};haptic(6);});
  const up=event=>{active.delete(event.pointerId);held[name]=active.size>0;button.classList.toggle('pressed',held[name]);};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,up);
});
document.querySelectorAll('[data-action]').forEach(button=>{
  button.addEventListener('pointerdown',event=>{
    event.preventDefault();if(!running||paused||countdown>0||demoMode)return;
    try{button.setPointerCapture(event.pointerId);}catch{}button.classList.add('pressed');
    if(button.dataset.action==='jump')jumpBuffer=.16;
    if(button.dataset.action==='attack'){held.attack=true;attackBuffer=.18;}
    if(button.dataset.action==='special')special(player);haptic(8);
  });
  const up=()=>{button.classList.remove('pressed');if(button.dataset.action==='attack')held.attack=false;};
  for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,up);
  // Keyboard activation of the touch buttons remains available.
  button.addEventListener('click',event=>{if(event.detail===0){if(button.dataset.action==='jump')jumpBuffer=.16;if(button.dataset.action==='attack')attackBuffer=.18;if(button.dataset.action==='special')special(player);}});
});
ui.startButton.addEventListener('click',enterMobilePlayMode);
ui.demoButton.addEventListener('click',enterDemoMode);
$('restart-button').addEventListener('click',()=>demoMode?enterDemoMode():enterMobilePlayMode());
$('change-character-button').addEventListener('click',showMenu);$('menu-button').addEventListener('click',showMenu);
$('resume-button').addEventListener('click',()=>setPaused(false));
ui.pauseButton.addEventListener('click',togglePause);ui.fullscreenButton.addEventListener('click',toggleFullscreen);
ui.soundButton.addEventListener('click',()=>{void audio.unlock();bgmMuted=!bgmMuted;soundUi();savePreferences();});
$('music-volume').addEventListener('input',event=>{volume=Number(event.target.value)/100;audio.setVolume(volume);$('volume-value').textContent=Math.round(volume*100)+'%';savePreferences();});
document.querySelectorAll('[data-character]').forEach(button=>button.addEventListener('click',()=>{void audio.unlock();selectCharacter(button.dataset.character);beep(400,.07,'triangle',.025);}));
$('opponent-select').addEventListener('change',event=>{settings.opponent=event.target.value;refreshOpponent();savePreferences();});
$('difficulty-select').addEventListener('change',event=>{settings.difficulty=event.target.value;savePreferences();});
addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
addEventListener('orientationchange',()=>setTimeout(resize,100));
addEventListener('blur',()=>{clearInputs();setPaused(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInputs();setPaused(true);}lastTime=performance.now();accumulator=0;});
shell.addEventListener('contextmenu',event=>event.preventDefault());
document.addEventListener('fullscreenchange',()=>{ui.fullscreenButton.textContent=document.fullscreenElement?'×':'⛶';resize();});
// Keep keyboard focus in the pause dialog.
ui.pause.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;const elements=[...ui.pause.querySelectorAll('button,input')],first=elements[0],last=elements.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
document.querySelectorAll('[data-character-image]').forEach(image=>image.src=sprites[image.dataset.characterImage].src);
readPreferences();$('opponent-select').value=settings.opponent;$('difficulty-select').value=settings.difficulty;
$('music-volume').value=Math.round(volume*100);$('volume-value').textContent=Math.round(volume*100)+'%';soundUi();
selectCharacter(selectedCharacter);setPlaySurfaces(false);
Promise.all([...Object.values(sprites).map(image=>image.decode()),loadPoseSheets(poseUrls)]).then(()=>{
  for(const key of ['arc','jet','mist']){
    const portrait=posePortrait(key);sprites[key].src=portrait;
    document.querySelectorAll('[data-character-image="'+key+'"]').forEach(image=>image.src=portrait);
  }
  assetsReady=true;ui.startButton.disabled=false;ui.demoButton.disabled=false;ui.startButton.querySelector('span').textContent='このファイターで対戦';
}).catch(()=>{ui.startButton.querySelector('span').textContent='画像を読み込めません';ui.demoButton.querySelector('span').textContent='画像を読み込めません';$('selected-description').textContent='ページを再読み込みしてください。';});
function registerWebMcp(){
  const context=document.modelContext;if(!context?.registerTool)return;
  for(const tool of [
    {name:'start_match',title:'対戦開始',description:'選択したキャラクターで対戦を開始します。',execute:()=>{if(!assetsReady)return{status:'loading'};resetMatch();return{status:'started',player:player.name,opponent:cpu.name};}},
    {name:'start_demo',title:'CPUデモ対戦','description':'ランダムなCPU同士の対戦を開始します。',execute:()=>{if(!assetsReady)return{status:'loading'};resetMatch(true);return{status:'started',mode:'demo',cpu1:player.name,cpu2:cpu.name};}},
    {name:'reset_match',title:'再戦',description:'選択したキャラクターで再戦します。',execute:()=>{if(!assetsReady)return{status:'loading'};resetMatch();return{status:'reset'};}},
  ])try{void Promise.resolve(context.registerTool({...tool,inputSchema:{type:'object',properties:{},additionalProperties:false}})).catch(()=>{});}catch{}
}
resize();registerWebMcp();requestAnimationFrame(tick);
