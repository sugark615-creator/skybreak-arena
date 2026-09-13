import test from 'node:test';
import assert from 'node:assert/strict';
import { bindTouchControls } from './touch-controls.js';

class FakeElement extends EventTarget {
  constructor(dataset = {}) {
    super();
    this.dataset = dataset;
    this.captures = new Set();
    const properties = new Map();
    this.style = {
      setProperty(name, value) { properties.set(name, value); },
      getPropertyValue(name) { return properties.get(name) || ''; },
    };
    const classes = new Set();
    this.classList = {
      toggle(name, value) { if (value) classes.add(name); else classes.delete(name); },
      remove(name) { classes.delete(name); },
      contains(name) { return classes.has(name); },
    };
  }
  getBoundingClientRect() { return { left: 100, right: 300, top: 200, bottom: 400, width: 200, height: 200 }; }
  setPointerCapture(id) { this.captures.add(id); }
  hasPointerCapture(id) { return this.captures.has(id); }
  releasePointerCapture(id) {
    if (this.captures.delete(id)) fire(this, 'lostpointercapture', { pointerId: id });
  }
}
function fire(element, type, props = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 140, clientY: 300, ...props });
  element.dispatchEvent(event);
  return event;
}
function setup() {
  const root = new FakeElement();
  const pad = new FakeElement();
  const knob = new FakeElement();
  knob.getBoundingClientRect = () => ({ width: 80, height: 80 });
  pad.querySelector = selector => selector === '.stick-knob' ? knob : null;
  const guard = new FakeElement({ hold: 'guard' });
  const attack = new FakeElement({ action: 'attack' });
  const jump = new FakeElement({ action: 'jump' });
  const special = new FakeElement({ action: 'special' });
  const bySelector = { '.move-pad': pad };
  root.querySelector = selector => bySelector[selector] || null;
  root.querySelectorAll = () => [guard, attack, jump, special];
  const held = { left: false, right: false, guard: false, attack: false };
  const actions = [];
  const state = { canMove: true, canAct: true, changes: 0 };
  const controls = bindTouchControls({
    root, canMove: () => state.canMove, canAct: () => state.canAct,
    onHeld: (name, value) => { held[name] = value; },
    onAction: name => actions.push(name),
    onInputChange: () => { state.changes++; },
  });
  return { root, pad, knob, guard, attack, jump, special, held, actions, state, controls };
}
const stickPosition = pad => [Number.parseFloat(pad.style.getPropertyValue('--stick-x')), Number.parseFloat(pad.style.getPropertyValue('--stick-y'))];
function assertStick(pad, expected) {
  stickPosition(pad).forEach((value, axis) => assert.ok(Math.abs(value - expected[axis]) < 1e-9));
}

test('a captured thumb slides directly between left and right without lifting', () => {
  const s = setup();
  assert.equal(fire(s.pad, 'pointerdown').defaultPrevented, true);
  assert.equal(s.pad.hasPointerCapture(1), true);
  assert.equal(s.held.left, true);
  assert.equal(s.pad.classList.contains('active'), true);
  assert.deepEqual(stickPosition(s.pad), [-48, 0]);
  fire(s.pad, 'pointermove', { clientX: 260 });
  assert.deepEqual(s.held, { left: false, right: true, guard: false, attack: false });
  assert.deepEqual(stickPosition(s.pad), [48, 0]);
  const changes = s.state.changes;
  for (let i = 0; i < 30; i++) fire(s.pad, 'pointermove', { clientX: 260 + i });
  assert.equal(s.state.changes, changes, 'same-direction pointer moves do not flood online input');
  fire(s.pad, 'pointerup');
  assert.equal(s.held.right, false);
  assert.equal(s.pad.captures.size, 0);
  assert.equal(s.pad.classList.contains('active'), false);
  assert.deepEqual(stickPosition(s.pad), [0, 0]);
});

test('radial deadzone tolerates resting thumb jitter and pure vertical motion never moves or jumps', () => {
  const s = setup();
  fire(s.pad, 'pointerdown', { clientX: 200 });
  for (const [clientX, clientY] of [[200, 300], [212, 312], [188, 288], [200, 120], [200, 480], [217, 300]]) {
    fire(s.pad, 'pointermove', { clientX, clientY });
    assert.equal(s.held.left || s.held.right, false);
  }
  assert.equal(s.state.changes, 0);
  assert.deepEqual(s.actions, []);
  fire(s.pad, 'pointermove', { clientX: 220 });
  assert.equal(s.held.right, true);
  fire(s.pad, 'pointermove', { clientX: 180 });
  assert.equal(s.held.left, true);
  fire(s.pad, 'pointermove', { clientX: 200, clientY: 600 });
  assert.equal(s.held.left || s.held.right, false);
  assert.deepEqual(stickPosition(s.pad), [0, 48]);
});

test('captured drags outside the base retain direction with a radial visual clamp', () => {
  const s = setup();
  fire(s.pad, 'pointerdown', { clientX: 200 });
  fire(s.pad, 'pointermove', { clientX: 500, clientY: 700 });
  assert.equal(s.held.right, true);
  assertStick(s.pad, [28.8, 38.4]);
  assert.ok(Math.abs(Math.hypot(...stickPosition(s.pad)) - 48) < 1e-9);
  fire(s.pad, 'pointermove', { clientX: -400, clientY: -500 });
  assert.equal(s.held.left, true);
  assertStick(s.pad, [-28.8, -38.4]);
  fire(s.pad, 'pointermove', { clientX: 170, clientY: 290 });
  assert.deepEqual(stickPosition(s.pad), [-30, -10], 'inside the base the knob follows the thumb exactly');
  fire(s.pad, 'pointermove', { clientX: 200 });
  assert.equal(s.held.left || s.held.right, false);
  assert.deepEqual(stickPosition(s.pad), [0, 0]);
});

test('the first movement finger owns the stick and extra fingers never take over', () => {
  const s = setup();
  fire(s.pad, 'pointerdown', { pointerId: 1, clientX: 140 });
  fire(s.pad, 'pointerdown', { pointerId: 2, clientX: 260 });
  assert.equal(s.held.left, true);
  assert.equal(s.pad.hasPointerCapture(2), false);
  fire(s.pad, 'pointermove', { pointerId: 2, clientX: 280 });
  fire(s.pad, 'pointerup', { pointerId: 2 });
  assert.equal(s.held.left, true);
  fire(s.pad, 'pointermove', { pointerId: 1, clientX: 260 });
  assert.equal(s.held.right, true);
  fire(s.pad, 'pointerdown', { pointerId: 3, clientX: 140 });
  fire(s.pad, 'pointercancel', { pointerId: 1 });
  assert.equal(s.held.left || s.held.right, false);
  assert.deepEqual(stickPosition(s.pad), [0, 0]);
  fire(s.pad, 'pointermove', { pointerId: 3, clientX: 140 });
  assert.equal(s.held.left, false, 'a previously ignored finger must lift and press again');
  fire(s.pad, 'pointerup', { pointerId: 3 });
  fire(s.pad, 'pointerdown', { pointerId: 3, clientX: 140 });
  assert.equal(s.held.left, true);
});

test('losing pointer capture recenters the stick and ignores stale movement', () => {
  const s = setup();
  fire(s.pad, 'pointerdown');
  fire(s.pad, 'lostpointercapture');
  assert.equal(s.held.left || s.held.right, false);
  assert.deepEqual(stickPosition(s.pad), [0, 0]);
  assert.equal(s.pad.classList.contains('active'), false);
  const changes = s.state.changes;
  fire(s.pad, 'pointermove', { clientX: 260 });
  fire(s.pad, 'pointerup');
  assert.equal(s.state.changes, changes);
});

test('moving, jumping, attacking and guarding keep independent touch state', () => {
  const s = setup();
  fire(s.pad, 'pointerdown', { pointerId: 1 });
  fire(s.attack, 'pointerdown', { pointerId: 2 });
  fire(s.jump, 'pointerdown', { pointerId: 3 });
  fire(s.guard, 'pointerdown', { pointerId: 4 });
  assert.deepEqual(s.actions, ['attack', 'jump']);
  assert.deepEqual(s.held, { left: true, right: false, guard: true, attack: true });
  fire(s.jump, 'pointerup', { pointerId: 3 });
  fire(s.attack, 'pointerup', { pointerId: 2 });
  assert.equal(s.held.left, true);
  assert.equal(s.held.guard, true);
  assert.equal(s.held.attack, false);
  fire(s.guard, 'pointercancel', { pointerId: 4 });
  assert.equal(s.held.guard, false);
  assert.equal(s.held.left, true);
});

test('a second attack finger cannot release the first or re-trigger its initial strike', () => {
  const s = setup();
  fire(s.attack, 'pointerdown', { pointerId: 2 });
  fire(s.attack, 'pointerdown', { pointerId: 3 });
  fire(s.attack, 'pointerdown', { pointerId: 3 });
  assert.deepEqual(s.actions, ['attack']);
  fire(s.attack, 'pointerup', { pointerId: 2 });
  assert.equal(s.held.attack, true);
  assert.equal(s.attack.classList.contains('pressed'), true);
  fire(s.attack, 'lostpointercapture', { pointerId: 3 });
  assert.equal(s.held.attack, false);
  assert.equal(s.attack.classList.contains('pressed'), false);
  fire(s.attack, 'pointerdown', { pointerId: 4 });
  assert.deepEqual(s.actions, ['attack', 'attack']);
});

test('each independent jump and special down acts once', () => {
  const s = setup();
  fire(s.jump, 'pointerdown', { pointerId: 2 });
  fire(s.jump, 'pointerdown', { pointerId: 3 });
  fire(s.jump, 'pointerdown', { pointerId: 3 });
  fire(s.special, 'pointerdown', { pointerId: 4 });
  fire(s.special, 'pointerdown', { pointerId: 5 });
  assert.deepEqual(s.actions, ['jump', 'jump', 'special', 'special']);
  assert.equal(s.state.changes, 0, 'actions notify through their own callback, not held-state changes');
});

test('clear releases all captures and stale pointer events cannot resurrect held input', () => {
  const s = setup();
  fire(s.pad, 'pointerdown', { pointerId: 1 });
  fire(s.attack, 'pointerdown', { pointerId: 2 });
  fire(s.guard, 'pointerdown', { pointerId: 3 });
  fire(s.jump, 'pointerdown', { pointerId: 4 });
  s.controls.clear();
  assert.deepEqual(s.held, { left: false, right: false, guard: false, attack: false });
  for (const element of [s.pad, s.attack, s.guard, s.jump]) {
    assert.equal(element.captures.size, 0);
    assert.equal(element.classList.contains('pressed'), false);
  }
  assert.equal(s.pad.classList.contains('active'), false);
  assert.deepEqual(stickPosition(s.pad), [0, 0]);
  const changes = s.state.changes;
  fire(s.pad, 'pointermove', { pointerId: 1, clientX: 260 });
  fire(s.attack, 'pointerup', { pointerId: 2 });
  s.controls.clear();
  assert.equal(s.state.changes, changes);
  assert.equal(s.held.left || s.held.right || s.held.attack || s.held.guard, false);
});

test('movement and action gates block new input and movement-gate loss cancels the existing thumb', () => {
  const s = setup();
  s.state.canMove = false;
  s.state.canAct = false;
  fire(s.pad, 'pointerdown');
  fire(s.guard, 'pointerdown', { pointerId: 2 });
  fire(s.attack, 'pointerdown', { pointerId: 3 });
  fire(s.jump, 'click', { detail: 0 });
  assert.equal(s.pad.captures.size + s.guard.captures.size + s.attack.captures.size, 0);
  assert.deepEqual(s.actions, []);
  s.state.canMove = true;
  fire(s.pad, 'pointerdown');
  fire(s.guard, 'pointerdown', { pointerId: 2 });
  fire(s.special, 'pointerdown', { pointerId: 3 });
  assert.equal(s.held.left, true);
  assert.equal(s.held.guard, true);
  assert.deepEqual(s.actions, [], 'countdown can permit held movement without attacks');
  s.state.canMove = false;
  fire(s.pad, 'pointermove');
  assert.equal(s.held.left, false);
  assert.equal(s.pad.captures.size, 0);
  s.state.canMove = true;
  fire(s.pad, 'pointermove', { clientX: 260 });
  assert.equal(s.held.right, false, 'gated pointer must press again');
});

test('non-primary mouse buttons are ignored; keyboard action clicks never latch an attack', () => {
  const s = setup();
  fire(s.pad, 'pointerdown', { pointerType: 'mouse', button: 2 });
  fire(s.attack, 'pointerdown', { pointerType: 'mouse', button: 1 });
  assert.equal(s.state.changes, 0);
  assert.deepEqual(s.actions, []);
  fire(s.attack, 'click', { detail: 1 });
  fire(s.attack, 'click', { detail: 0 });
  assert.deepEqual(s.actions, ['attack']);
  assert.equal(s.held.attack, false);
});

test('control-only native gestures are prevented', () => {
  const s = setup();
  for (const type of ['touchmove', 'contextmenu', 'dragstart']) assert.equal(fire(s.root, type).defaultPrevented, true);
});
