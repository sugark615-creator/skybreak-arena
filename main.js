import * as THREE from 'three';
import './style.css';

const canvas = document.querySelector('#arena');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050714);
scene.fog = new THREE.FogExp2(0x090b20, 0.018);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 220);
camera.position.set(0, 15, 29);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;

scene.add(new THREE.HemisphereLight(0x9aa7ff, 0x111329, 1.5));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.3);
keyLight.position.set(-10, 20, 12);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -30; keyLight.shadow.camera.right = 30;
keyLight.shadow.camera.top = 25; keyLight.shadow.camera.bottom = -18;
scene.add(keyLight);

const world = new THREE.Group();
scene.add(world);

function material(color, emissive = 0x000000, metalness = .45) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: .7, metalness, roughness: .28 });
}

const platformMat = material(0x252b55, 0x090d2a, .8);
const edgeMat = material(0x6fffea, 0x32d9c4, .55);
const magentaMat = material(0xff4fd8, 0xa11681, .55);

function addPlatform(x, y, z, w, h, d, accent = edgeMat) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), platformMat);
  base.position.y = -h / 2;
  base.castShadow = true; base.receiveShadow = true;
  group.add(base);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + .15, .12, d + .15), accent);
  top.position.y = .03; top.receiveShadow = true;
  group.add(top);
  const under = new THREE.Mesh(new THREE.ConeGeometry(Math.min(w, d) * .47, 4.5, 5), material(0x171b3d, 0x080b20, .8));
  under.rotation.y = Math.PI / 4; under.position.y = -h - 2; group.add(under);
  group.position.set(x, y, z); world.add(group);
  return { x, y, z, w, h, d, group };
}

const platforms = [
  addPlatform(0, 0, 0, 21, .8, 9, edgeMat),
  addPlatform(-9, 4.2, 0, 7, .55, 5, magentaMat),
  addPlatform(9, 4.2, 0, 7, .55, 5, magentaMat),
  addPlatform(0, 7.4, 0, 6, .5, 4, edgeMat),
];

const core = new THREE.Mesh(new THREE.OctahedronGeometry(2.2), material(0x7480ff, 0x3b42d4, .35));
core.position.set(0, -7, -1); world.add(core);
const coreRing = new THREE.Mesh(new THREE.TorusGeometry(4.5, .08, 8, 64), edgeMat);
coreRing.position.copy(core.position); coreRing.rotation.x = Math.PI / 2; world.add(coreRing);
const coreRing2 = coreRing.clone(); coreRing2.scale.setScalar(1.35); coreRing2.material = magentaMat; world.add(coreRing2);

for (let i = 0; i < 90; i++) {
  const geo = new THREE.IcosahedronGeometry(Math.random() * .08 + .025, 0);
  const star = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: i % 5 ? 0xb9c7ff : 0x6fffea }));
  const radius = 35 + Math.random() * 80;
  const theta = Math.random() * Math.PI * 2;
  star.position.set(Math.cos(theta) * radius, Math.random() * 55 - 10, -25 - Math.random() * 85);
  world.add(star);
}

for (let i = 0; i < 12; i++) {
  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.2 + Math.random() * 2.2, 7 + Math.random() * 18, 1.2 + Math.random() * 2), material(0x10162f, 0x050719, .7));
  const side = i % 2 ? 1 : -1;
  tower.position.set(side * (18 + Math.random() * 26), -8 + tower.geometry.parameters.height / 2, -15 - Math.random() * 30);
  tower.rotation.y = Math.random(); world.add(tower);
}

const groundGrid = new THREE.GridHelper(150, 42, 0x30376b, 0x171a37);
groundGrid.position.y = -12; world.add(groundGrid);

function createFighter(name, color, dark, startX, ai = false) {
  const group = new THREE.Group();
  const bodyMat = material(dark, color, .7);
  const glowMat = material(color, color, .45);
  const arms = [];
  const hands = [];
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.72, 1.15, 7, 14), bodyMat);
  body.position.y = 1.22; body.castShadow = true; group.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(.72, 1), glowMat);
  head.position.y = 2.48; head.scale.z = .88; head.castShadow = true; group.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(.82, .19, .15), new THREE.MeshBasicMaterial({ color: 0xf1ffff }));
  visor.position.set(0, 2.54, .64); group.add(visor);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.22, .82, 5, 9), bodyMat);
    arm.position.set(side * .83, 1.4, 0); arm.rotation.z = side * -.2; arm.castShadow = true; group.add(arm);
    arms.push(arm);
    const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(.34, 1), glowMat);
    hand.position.set(side * .95, .85, 0); hand.castShadow = true; group.add(hand);
    hands.push(hand);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.3, .75, 5, 10), bodyMat);
    leg.position.set(side * .36, .25, 0); leg.castShadow = true; group.add(leg);
  }
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.75, 24, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .16, wireframe: true }));
  shield.position.y = 1.25; shield.visible = false; group.add(shield);
  const meleeFx = new THREE.Group();
  const arc = new THREE.Mesh(
    new THREE.RingGeometry(1.12, 1.52, 28, 1, -.92, 1.84),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .72, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  arc.position.set(0, 1.28, 1.04);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(.17, .17, 2.25), glowMat);
  blade.position.set(.78, 1.15, 1.1);
  blade.rotation.x = -.18;
  meleeFx.add(arc, blade);
  meleeFx.visible = false;
  group.add(meleeFx);
  group.position.set(startX, 1, 0); world.add(group);
  return {
    name, group, color, ai, damage: 0, stocks: 3, velocity: new THREE.Vector3(),
    grounded: false, jumps: 2, attackCooldown: 0, specialCooldown: 0, stun: 0,
    guard: false, shield: 100, shieldMesh: shield, facing: ai ? -1 : 1,
    respawn: 0, invincible: 0, eliminated: false, hitFlash: 0,
    arms, hands, meleeFx, attackTimer: 0, attackDuration: .26,
    comboStep: 0, comboWindow: 0, attackHasHit: false,
  };
}

const player = createFighter('NOVA', 0x6fffea, 0x20395f, -5, false);
const cpu = createFighter('VEX', 0xff4fd8, 0x58204f, 5, true);
const fighters = [player, cpu];
const projectiles = [];
const particles = [];
const keys = new Set();
const held = { forward: false, back: false, left: false, right: false, guard: false };
let running = false;
let paused = false;
let matchTime = 180;
let lastTime = performance.now();
let shake = 0;
let calloutTimer;
let audioContext;

function beep(freq, duration, type = 'sine', gain = .035) {
  try {
    audioContext ??= new AudioContext();
    const osc = audioContext.createOscillator();
    const amp = audioContext.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(45, freq * .45), audioContext.currentTime + duration);
    amp.gain.setValueAtTime(gain, audioContext.currentTime);
    amp.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
    osc.connect(amp).connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + duration);
  } catch {}
}

function announce(text, seconds = .7) {
  const el = document.querySelector('#center-callout');
  el.textContent = text; el.classList.add('show'); clearTimeout(calloutTimer);
  calloutTimer = setTimeout(() => el.classList.remove('show'), seconds * 1000);
}

function resetFighter(f, full = false) {
  f.group.position.set(f.ai ? 5 : -5, 8, 0);
  f.velocity.set(0, 0, 0); f.damage = full ? 0 : f.damage; f.grounded = false; f.jumps = 2;
  f.stun = 0; f.respawn = 1.4; f.invincible = 2.5; f.guard = false; f.shield = full ? 100 : f.shield; f.eliminated = false;
  f.attackTimer = 0; f.comboStep = 0; f.comboWindow = 0; f.attackHasHit = false; f.meleeFx.visible = false;
  f.group.visible = true;
}

function resetMatch() {
  running = true; paused = false; matchTime = 180;
  for (const f of fighters) { f.stocks = 3; resetFighter(f, true); }
  for (const p of projectiles) world.remove(p.mesh); projectiles.length = 0;
  document.querySelector('#result-screen').classList.remove('visible');
  document.querySelector('#start-screen').classList.remove('visible');
  document.querySelector('#pause-button').textContent = 'Ⅱ';
  updateHud(); announce('FIGHT!', 1.1); beep(480, .22, 'sawtooth', .05);
}

function findFloor(pos, velocityY) {
  if (velocityY > .2) return null;
  let best = null;
  for (const p of platforms) {
    const onX = Math.abs(pos.x - p.x) < p.w / 2 + .42;
    const onZ = Math.abs(pos.z - p.z) < p.d / 2 + .42;
    const above = pos.y >= p.y - .25 && pos.y <= p.y + 1.05;
    if (onX && onZ && above && (!best || p.y > best.y)) best = p;
  }
  return best;
}

function tryJump(f) {
  if (!running || paused || f.stun > 0 || f.respawn > 0 || f.eliminated) return;
  if (f.grounded || f.jumps > 0) {
    f.velocity.y = f.grounded ? 9.8 : 9.1;
    if (!f.grounded) f.jumps--;
    f.grounded = false; beep(260, .12, 'triangle', .025);
  }
}

function meleeAttack(attacker, target) {
  if (!running || paused || attacker.attackCooldown > 0 || attacker.stun > 0 || attacker.respawn > 0 || attacker.eliminated) return;
  attacker.comboStep = attacker.comboWindow > 0 ? (attacker.comboStep % 3) + 1 : 1;
  attacker.comboWindow = .62;
  attacker.attackDuration = attacker.comboStep === 3 ? .38 : .27;
  attacker.attackTimer = attacker.attackDuration;
  attacker.attackCooldown = attacker.comboStep === 3 ? .48 : .2;
  attacker.attackHasHit = false;
  attacker.meleeFx.visible = true;
  attacker.velocity.x += attacker.facing * (attacker.comboStep === 3 ? 2.2 : 1.25);
  beep(210 + attacker.comboStep * 85, .1, 'sawtooth', .026);
}

function resolveMeleeHit(attacker, target) {
  if (attacker.attackHasHit || attacker.attackTimer <= 0) return;
  const progress = 1 - attacker.attackTimer / attacker.attackDuration;
  if (progress < .27 || progress > .72) return;
  const delta = target.group.position.clone().sub(attacker.group.position);
  const inFront = Math.sign(delta.x || attacker.facing) === attacker.facing;
  const reach = attacker.comboStep === 3 ? 3.65 : 3.15;
  if (delta.length() > reach || !inFront || target.respawn > 0) return;
  attacker.attackHasHit = true;
  const combo = [
    null,
    { damage: 5, force: 4.4, lift: .05 },
    { damage: 7, force: 5.1, lift: .15 },
    { damage: 12, force: 8.2, lift: .34 },
  ][attacker.comboStep];
  const direction = new THREE.Vector3(attacker.facing, combo.lift, delta.z * .05).normalize();
  applyHit(target, attacker, combo.damage, direction, combo.force);
  if (attacker.comboStep === 3) announce('3 HIT!', .45);
}

function specialAttack(attacker) {
  if (!running || paused || attacker.specialCooldown > 0 || attacker.stun > 0 || attacker.respawn > 0 || attacker.eliminated) return;
  attacker.specialCooldown = 1.15;
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(.52, 2), material(attacker.color, attacker.color, .25));
  mesh.position.copy(attacker.group.position).add(new THREE.Vector3(attacker.facing * 1.3, 1.4, 0));
  world.add(mesh);
  projectiles.push({ mesh, owner: attacker, life: 1.7, velocity: new THREE.Vector3(attacker.facing * 12, .1, 0) });
  beep(attacker.ai ? 320 : 520, .28, 'sawtooth', .025);
}

function applyHit(target, attacker, damage, direction, force) {
  if (target.invincible > 0 || target.eliminated) return;
  if (target.guard && target.shield > 0) {
    target.shield = Math.max(0, target.shield - damage * 2.8);
    target.velocity.add(direction.clone().multiplyScalar(force * .18));
    spawnBurst(target.group.position, target.color, 5); beep(110, .1, 'square', .02);
    if (target.shield <= 0) { target.stun = 2; target.guard = false; announce('SHIELD BREAK', .8); }
    return;
  }
  target.damage = Math.min(999, target.damage + damage);
  const scale = 1 + target.damage / 58;
  const launch = direction.clone().normalize().multiplyScalar(force * scale);
  launch.y += 2.8 + target.damage * .025;
  target.velocity.copy(launch); target.stun = .18 + target.damage * .0024;
  target.hitFlash = .12; shake = Math.min(.48, .12 + target.damage / 500);
  spawnBurst(target.group.position.clone().add(new THREE.Vector3(0,1,0)), attacker.color, Math.min(16, 7 + Math.floor(target.damage / 30)));
  beep(165 - Math.min(70, target.damage * .22), .14, 'square', .045);
}

function spawnBurst(position, color, count) {
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(new THREE.TetrahedronGeometry(.11 + Math.random() * .12), new THREE.MeshBasicMaterial({ color }));
    mesh.position.copy(position); world.add(mesh);
    particles.push({ mesh, life: .45 + Math.random() * .25, velocity: new THREE.Vector3((Math.random()-.5)*8, Math.random()*7, (Math.random()-.5)*8) });
  }
}

function ringOut(f) {
  if (f.respawn > 0 || f.eliminated) return;
  f.stocks--;
  spawnBurst(f.group.position, f.color, 22); shake = .55; beep(75, .65, 'sawtooth', .07);
  announce('RING OUT!', 1);
  if (f.stocks <= 0) {
    f.eliminated = true; f.group.visible = false;
    finishMatch(f === cpu);
  } else {
    f.damage = 0; resetFighter(f);
  }
  updateHud();
}

function finishMatch(playerWon) {
  running = false;
  const title = document.querySelector('#result-title');
  title.textContent = playerWon ? 'VICTORY' : 'DEFEAT';
  title.style.color = playerWon ? '#6fffea' : '#ff4fd8';
  document.querySelector('#result-copy').textContent = playerWon ? 'NOVAが空中闘技場を制しました。' : 'VEXの反撃を受けました。もう一度挑戦できます。';
  setTimeout(() => document.querySelector('#result-screen').classList.add('visible'), 700);
  beep(playerWon ? 620 : 120, .7, playerWon ? 'triangle' : 'sawtooth', .05);
}

function playerControl(dt) {
  if (player.stun > 0 || player.respawn > 0 || player.eliminated) return;
  const dx = (keys.has('KeyD') || keys.has('ArrowRight') || held.right ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') || held.left ? 1 : 0);
  const dz = (keys.has('KeyS') || keys.has('ArrowDown') || held.back ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') || held.forward ? 1 : 0);
  const moving = new THREE.Vector2(dx, dz);
  if (moving.lengthSq() > 0) {
    moving.normalize(); const accel = player.grounded ? 30 : 18;
    player.velocity.x += moving.x * accel * dt; player.velocity.z += moving.y * accel * dt;
    if (Math.abs(moving.x) > .1) player.facing = Math.sign(moving.x);
  }
  player.guard = (keys.has('KeyL') || held.guard) && player.shield > 0;
}

function cpuControl(dt) {
  if (cpu.stun > 0 || cpu.respawn > 0 || cpu.eliminated) return;
  const toPlayer = player.group.position.clone().sub(cpu.group.position);
  const flat = new THREE.Vector2(toPlayer.x, toPlayer.z);
  cpu.facing = Math.sign(toPlayer.x || cpu.facing);
  if (cpu.group.position.y < -1 && cpu.jumps > 0) tryJump(cpu);
  if (flat.length() > 2.25) {
    flat.normalize(); const speed = cpu.grounded ? 21 : 13;
    cpu.velocity.x += flat.x * speed * dt; cpu.velocity.z += flat.y * speed * dt;
  }
  cpu.guard = cpu.shield > 18 && player.attackCooldown > .25 && flat.length() < 2.6 && Math.random() < .025;
  if (flat.length() < 2.75 && Math.abs(toPlayer.y) < 2.2 && Math.random() < .09) meleeAttack(cpu, player);
  else if (flat.length() < 11 && Math.abs(toPlayer.y) < 4 && Math.random() < .012) specialAttack(cpu);
  if (cpu.grounded && player.group.position.y > cpu.group.position.y + 2.5 && Math.random() < .035) tryJump(cpu);
}

function updateFighter(f, dt) {
  f.attackCooldown = Math.max(0, f.attackCooldown - dt);
  f.specialCooldown = Math.max(0, f.specialCooldown - dt);
  f.stun = Math.max(0, f.stun - dt);
  f.respawn = Math.max(0, f.respawn - dt);
  f.invincible = Math.max(0, f.invincible - dt);
  f.hitFlash = Math.max(0, f.hitFlash - dt);
  f.comboWindow = Math.max(0, f.comboWindow - dt);
  f.attackTimer = Math.max(0, f.attackTimer - dt);
  if (f.eliminated) return;
  f.shieldMesh.visible = f.guard && f.shield > 0;
  if (f.attackTimer > 0) {
    const swing = 1 - f.attackTimer / f.attackDuration;
    const arc = Math.sin(swing * Math.PI);
    f.meleeFx.visible = true;
    f.meleeFx.rotation.z = -1.35 + swing * 2.7;
    f.meleeFx.scale.setScalar(.74 + arc * .34 + (f.comboStep === 3 ? .18 : 0));
    f.meleeFx.children[0].material.opacity = .28 + arc * .65;
    f.arms[1].rotation.x = -1.4 + swing * 2.8;
    f.hands[1].position.z = .2 + arc * .72;
  } else {
    f.meleeFx.visible = false;
    f.arms[1].rotation.x = THREE.MathUtils.lerp(f.arms[1].rotation.x, 0, .24);
    f.hands[1].position.z = THREE.MathUtils.lerp(f.hands[1].position.z, 0, .24);
    if (f.comboWindow <= 0) f.comboStep = 0;
  }
  f.shieldMesh.scale.setScalar(.55 + f.shield / 220);
  f.group.traverse(o => { if (o.material?.emissive) o.material.emissiveIntensity = f.hitFlash > 0 ? 3.5 : .7; });
  if (f.guard) { f.shield = Math.max(0, f.shield - 16 * dt); f.velocity.x *= .83; f.velocity.z *= .83; }
  else f.shield = Math.min(100, f.shield + 8 * dt);
  f.velocity.y -= 23 * dt;
  const drag = f.grounded ? Math.pow(.0007, dt) : Math.pow(.13, dt);
  f.velocity.x *= drag; f.velocity.z *= drag;
  const maxSpeed = f.guard ? 2 : 9.2;
  const horizontal = Math.hypot(f.velocity.x, f.velocity.z);
  if (horizontal > maxSpeed && f.stun <= 0) { f.velocity.x *= maxSpeed/horizontal; f.velocity.z *= maxSpeed/horizontal; }
  f.group.position.addScaledVector(f.velocity, dt);
  const floor = findFloor(f.group.position, f.velocity.y);
  if (floor && f.velocity.y <= 0) {
    f.group.position.y = floor.y; f.velocity.y = 0; f.grounded = true; f.jumps = 2;
  } else f.grounded = false;
  const lean = THREE.MathUtils.clamp(-f.velocity.x * .025, -.18, .18);
  f.group.rotation.z = THREE.MathUtils.lerp(f.group.rotation.z, lean, .1);
  f.group.rotation.y = THREE.MathUtils.lerp(f.group.rotation.y, f.facing > 0 ? Math.PI/2 : -Math.PI/2, .14);
  const bob = f.grounded && horizontal > .5 ? Math.sin(performance.now() * .018) * .06 : 0;
  f.group.children[0].position.y = 1.22 + bob;
  const opponent = f === player ? cpu : player;
  resolveMeleeHit(f, opponent);
  if (Math.abs(f.group.position.x) > 29 || f.group.position.y < -14 || Math.abs(f.group.position.z) > 20) ringOut(f);
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]; p.life -= dt; p.mesh.position.addScaledVector(p.velocity, dt); p.mesh.rotation.x += dt * 7; p.mesh.rotation.y += dt * 11;
    const target = p.owner === player ? cpu : player;
    if (target.group.visible && target.respawn <= 0 && p.mesh.position.distanceTo(target.group.position.clone().add(new THREE.Vector3(0,1.2,0))) < 1.65) {
      applyHit(target, p.owner, 12, p.velocity.clone().normalize(), 7.1); p.life = 0;
    }
    if (p.life <= 0) { world.remove(p.mesh); projectiles.splice(i,1); }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt; p.velocity.y -= 14 * dt; p.mesh.position.addScaledVector(p.velocity, dt); p.mesh.rotation.x += dt * 8;
    p.mesh.scale.setScalar(Math.max(0, p.life * 1.7));
    if (p.life <= 0) { world.remove(p.mesh); particles.splice(i,1); }
  }
}

function updateCamera(dt) {
  const midpoint = player.group.position.clone().add(cpu.group.position).multiplyScalar(.5);
  midpoint.y = Math.max(1.5, midpoint.y + 2.5); midpoint.z *= .35;
  const spread = player.group.position.distanceTo(cpu.group.position);
  const distance = THREE.MathUtils.clamp(23 + spread * .5, 25, 39);
  const desired = new THREE.Vector3(midpoint.x * .25, 13 + Math.max(0, midpoint.y * .35), distance);
  const smooth = 1 - Math.pow(.001, dt);
  camera.position.lerp(desired, smooth);
  if (shake > 0) { camera.position.x += (Math.random()-.5) * shake; camera.position.y += (Math.random()-.5) * shake; shake = Math.max(0, shake - dt * 1.8); }
  camera.lookAt(midpoint);
}

function updateHud() {
  document.querySelector('#player-damage').textContent = Math.round(player.damage);
  document.querySelector('#cpu-damage').textContent = Math.round(cpu.damage);
  document.querySelector('#player-stocks').textContent = Array(Math.max(0, player.stocks)).fill('◆').join(' ');
  document.querySelector('#cpu-stocks').textContent = Array(Math.max(0, cpu.stocks)).fill('◆').join(' ');
  document.querySelector('#player-shield').style.width = `${player.shield}%`;
  document.querySelector('#cpu-shield').style.width = `${cpu.shield}%`;
  const mins = Math.floor(matchTime / 60); const secs = Math.floor(matchTime % 60);
  document.querySelector('#timer').textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(.033, (now - lastTime) / 1000); lastTime = now;
  core.rotation.y += dt * .7; core.rotation.x += dt * .3; coreRing.rotation.z += dt * .16; coreRing2.rotation.z -= dt * .11;
  if (running && !paused) {
    matchTime = Math.max(0, matchTime - dt);
    if (matchTime <= 0) {
      const playerScore = player.stocks * 1000 - player.damage;
      const cpuScore = cpu.stocks * 1000 - cpu.damage;
      finishMatch(playerScore >= cpuScore);
    }
    playerControl(dt); cpuControl(dt); fighters.forEach(f => updateFighter(f, dt)); updateProjectiles(dt); updateParticles(dt); updateCamera(dt); updateHud();
  } else { updateParticles(dt); }
  renderer.render(scene, camera);
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  document.querySelector('#pause-button').textContent = paused ? '▶' : 'Ⅱ';
  announce(paused ? 'PAUSED' : 'FIGHT!', paused ? 3600 : .6);
}

addEventListener('keydown', (e) => {
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) {
    if (e.code === 'Space') tryJump(player);
    if (e.code === 'KeyJ') meleeAttack(player, cpu);
    if (e.code === 'KeyK') specialAttack(player);
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  }
  keys.add(e.code);
});
addEventListener('keyup', e => keys.delete(e.code));

document.querySelectorAll('[data-hold]').forEach(btn => {
  const name = btn.dataset.hold;
  const down = e => { e.preventDefault(); held[name] = true; btn.classList.add('pressed'); };
  const up = e => { e.preventDefault(); held[name] = false; btn.classList.remove('pressed'); };
  btn.addEventListener('pointerdown', down); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('pointerleave', up);
});
document.querySelectorAll('[data-action]').forEach(btn => btn.addEventListener('pointerdown', e => {
  e.preventDefault(); btn.classList.add('pressed');
  if (btn.dataset.action === 'jump') tryJump(player);
  if (btn.dataset.action === 'attack') meleeAttack(player, cpu);
  if (btn.dataset.action === 'special') specialAttack(player);
  setTimeout(() => btn.classList.remove('pressed'), 120);
}));

document.querySelector('#start-button').addEventListener('click', resetMatch);
document.querySelector('#restart-button').addEventListener('click', resetMatch);
document.querySelector('#pause-button').addEventListener('click', togglePause);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75)); renderer.setSize(innerWidth, innerHeight);
});

function registerWebMcp() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const tools = [
    { name: 'start_match', title: '対戦開始', description: 'CPUとの3ストック対戦を開始します。', execute: () => { resetMatch(); return { status: 'started', opponent: 'VEX', stocks: 3 }; } },
    { name: 'reset_match', title: '再戦', description: '現在の対戦をリセットして最初から再戦します。', execute: () => { resetMatch(); return { status: 'reset', stocks: 3 }; } },
  ];
  for (const tool of tools) {
    try { void Promise.resolve(context.registerTool({ ...tool, inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false } })).catch(() => {}); } catch {}
  }
}

registerWebMcp();
updateHud();
requestAnimationFrame(tick);
