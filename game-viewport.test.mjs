import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameViewport } from './game-viewport.js';

function fixture({ viewport = true } = {}) {
  const view = new EventTarget();
  Object.assign(view, { innerWidth: 844, innerHeight: 390, devicePixelRatio: 3 });
  if (viewport) {
    view.visualViewport = new EventTarget();
    Object.assign(view.visualViewport, { width: 844, height: 340, offsetLeft: 0, offsetTop: 24, scale: 1 });
  }
  const frames = new Map();
  let nextFrame = 0;
  view.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
  view.cancelAnimationFrame = id => frames.delete(id);
  const values = new Map();
  const writes = { styles: 0, width: 0, height: 0 };
  const shell = {
    ownerDocument: { defaultView: view },
    style: { setProperty(name, value) { values.set(name, value); writes.styles++; } },
    get clientWidth() { return parseFloat(values.get('--game-width')); },
    get clientHeight() { return parseFloat(values.get('--game-height')); },
  };
  let width = 300, height = 150;
  const canvas = {
    get width() { return width; }, set width(value) { width = value; writes.width++; },
    get height() { return height; }, set height(value) { height = value; writes.height++; },
  };
  const changes = [];
  const controller = createGameViewport(shell, canvas, state => changes.push(state));
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
  return { view, frames, values, writes, shell, canvas, changes, controller, flush };
}

test('canvas and controls share the measured visible viewport, with DPR capped at 2', () => {
  const f = fixture();
  assert.equal(f.changes.length, 0, 'factory does not call the consumer before initialization');
  assert.deepEqual(f.controller.sync(), { width: 844, height: 340, left: 0, top: 24, dpr: 2, pixelWidth: 1688, pixelHeight: 680 });
  assert.equal(f.values.get('--game-top'), '24px');
  assert.equal(f.canvas.height, 680);
  const writes = { ...f.writes };
  f.controller.sync();
  assert.deepEqual(f.writes, writes, 'unchanged viewport does not clear the canvas or rewrite styles');
  assert.equal(f.changes.length, 1);
});

test('window and visual viewport events coalesce; offset-only scroll does not resize the canvas', () => {
  const f = fixture();
  f.controller.sync();
  f.view.visualViewport.offsetTop = 0;
  f.view.dispatchEvent(new Event('scroll'));
  f.view.visualViewport.dispatchEvent(new Event('scroll'));
  f.view.dispatchEvent(new Event('resize'));
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.equal(f.values.get('--game-top'), '0px');
  assert.equal(f.changes.length, 1);
  assert.equal(f.writes.height, 1);
  f.view.visualViewport.height = 390;
  f.view.visualViewport.dispatchEvent(new Event('resize'));
  f.flush();
  assert.equal(f.canvas.height, 780);
  assert.equal(f.changes.length, 2);
});

test('pinch zoom keeps CSS pixel coordinates without cancelling the browser zoom', () => {
  const f = fixture();
  Object.assign(f.view.visualViewport, { width: 421.6, height: 194.6, offsetLeft: 35.125, offsetTop: 60.75, scale: 2 });
  f.controller.sync();
  assert.equal(f.values.get('--game-width'), '422px');
  assert.equal(f.values.get('--game-left'), '35.13px');
  assert.equal(f.canvas.width, 844);
  assert.equal(f.view.visualViewport.scale, 2);
});

test('fallback, measured shell size, and pixel ratio changes are handled', () => {
  const f = fixture({ viewport: false });
  Object.defineProperty(f.shell, 'clientWidth', { get: () => 800 });
  f.controller.sync();
  assert.equal(f.values.get('--game-height'), '390px');
  assert.equal(f.canvas.width, 1600, 'drawing resolution follows actual shell layout');
  f.view.devicePixelRatio = 1;
  f.controller.sync();
  assert.equal(f.canvas.width, 800);
  assert.equal(f.changes.length, 2);
});

test('callbacks can request a sync, and cleanup cancels queued work and events', () => {
  const f = fixture();
  let calls = 0;
  const recursive = createGameViewport(f.shell, f.canvas, () => { calls++; recursive.sync(); });
  recursive.sync();
  assert.equal(calls, 1);
  recursive.cleanup();
  f.view.dispatchEvent(new Event('resize'));
  assert.equal(f.frames.size, 1);
  f.controller.cleanup();
  assert.equal(f.frames.size, 0);
  f.view.dispatchEvent(new Event('resize'));
  f.view.visualViewport.dispatchEvent(new Event('scroll'));
  assert.equal(f.frames.size, 0);
});
