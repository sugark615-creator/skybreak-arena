import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleAudio } from './battle-audio-player.mjs';

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

async function withAudio(run, { delayedResume = false, delayedPlay = false } = {}) {
  const previous = { window: globalThis.window, document: globalThis.document };
  const players = [], contexts = [], calls = [];
  const doc = new EventTarget(); doc.hidden = false;
  class Parameter {
    value = 0;
    setValueAtTime(value) { this.value = value; }
    setTargetAtTime(value) { this.value = value; }
    linearRampToValueAtTime(value) { this.value = value; }
    exponentialRampToValueAtTime(value) { this.value = value; }
    cancelScheduledValues() {}
  }
  class Node {
    gain = new Parameter(); frequency = new Parameter(); playbackRate = new Parameter();
    disconnected = false; started = false;
    connect(node) { return node; }
    disconnect() { this.disconnected = true; }
    start() { this.started = true; }
    stop() {}
  }
  class Player extends EventTarget {
    paused = true; readyState = 0; duration = 180; currentTime = 0;
    currentSrc = ''; error = null; loads = []; pending = [];
    constructor() { super(); players.push(this); }
    load() {
      this.loads.push(this.src); this.currentSrc = this.src;
      this.currentTime = 0; this.readyState = 1; this.error = null;
      this.dispatchEvent(new Event('loadedmetadata'));
    }
    play() {
      calls.push('play');
      if (delayedPlay) return new Promise(resolve => this.pending.push(() => { this.paused = false; resolve(); }));
      this.paused = false; return Promise.resolve();
    }
    pause() { this.paused = true; }
    fail() { this.error = { code: 3 }; this.dispatchEvent(new Event('error')); }
  }
  class Context {
    state = 'suspended'; sampleRate = 8000; currentTime = 5;
    destination = new Node(); nodes = []; mediaSources = []; buffers = []; resumes = [];
    constructor() { contexts.push(this); }
    resume() {
      calls.push('resume');
      if (delayedResume && this.state !== 'running')
        return new Promise(resolve => this.resumes.push(() => { this.state = 'running'; resolve(); }));
      this.state = 'running'; return Promise.resolve();
    }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    createGain() { return new Node(); }
    createDynamicsCompressor() {
      const node = new Node();
      node.threshold = new Parameter(); node.knee = new Parameter(); node.ratio = new Parameter();
      return node;
    }
    createMediaElementSource(player) { this.mediaSources.push(player); return new Node(); }
    createBuffer(channels, frames) {
      this.buffers.push(frames); const data = new Float32Array(frames);
      return { getChannelData: () => data };
    }
    createOscillator() { const node = new Node(); node.kind = 'tone'; this.nodes.push(node); return node; }
    createBufferSource() { const node = new Node(); node.kind = 'combat'; this.nodes.push(node); return node; }
  }
  globalThis.window = { Audio: Player, AudioContext: Context };
  globalThis.document = doc;
  try { await run({ audio: createBattleAudio(), players, contexts, doc, calls }); }
  finally {
    if (previous.window === undefined) delete globalThis.window; else globalThis.window = previous.window;
    if (previous.document === undefined) delete globalThis.document; else globalThis.document = previous.document;
  }
}

test('menu is silent until gesture; unlock synchronously resumes and plays one streamed element', async () => {
  await withAudio(async ({ audio, players, contexts, calls }) => {
    audio.start('menu');
    assert.equal(players.length, 1); assert.equal(contexts.length, 0);
    assert.match(players[0].src, /media\/menu-theme\.m4a$/);
    assert.equal(players[0].paused, true);
    const ready = audio.unlock();
    assert.deepEqual(calls.slice(0, 2), ['resume', 'play']);
    await ready;
    assert.equal(players[0].paused, false);
    assert.equal(contexts[0].mediaSources.length, 1);
    assert.equal(contexts[0].buffers.length, 6, 'only short combat sounds are decoded');
    assert.ok(contexts[0].buffers.reduce((sum, frames) => sum + frames, 0) < 3 * contexts[0].sampleRate);
  });
});

test('same scene preserves playback and effects; a changed scene rewinds and stops old effects', async () => {
  await withAudio(async ({ audio, players, contexts }) => {
    audio.start('menu'); await audio.unlock();
    const player = players[0]; player.currentTime = 29;
    audio.sfx(400, .1); const tone = contexts[0].nodes.at(-1);
    audio.start('menu'); await flush();
    assert.equal(player.currentTime, 29); assert.equal(tone.disconnected, false);
    assert.equal(player.loads.length, 1);
    audio.start('battle'); await flush();
    assert.equal(player.currentTime, .75); assert.equal(tone.disconnected, true);
    assert.match(player.src, /battle-theme\.mp4$/);
    assert.equal(players.length, 1); assert.equal(contexts[0].mediaSources.length, 1);
    audio.start('menu'); await flush();
    assert.equal(player.currentTime, 0); assert.match(player.src, /menu-theme\.m4a$/);
  });
});

test('battle skips end silence, menu loops at its own end, and fallback runs at most once per entry', async () => {
  await withAudio(async ({ audio, players, contexts }) => {
    audio.start(); await audio.unlock(); const player = players[0];
    player.currentTime = 177.2; player.dispatchEvent(new Event('timeupdate'));
    assert.equal(player.currentTime, .75);
    player.fail(); await flush();
    assert.match(player.src, /ignition\.wav$/); assert.equal(player.currentTime, 0);
    const warn = console.warn; console.warn = () => {};
    try { player.fail(); player.fail(); } finally { console.warn = warn; }
    assert.equal(player.loads.length, 2); assert.equal(player.paused, true);
    audio.sfx(440, .1); assert.equal(contexts[0].nodes.at(-1).started, true);
    audio.start('menu'); await flush();
    player.currentTime = 177.2; player.dispatchEvent(new Event('timeupdate'));
    assert.equal(player.currentTime, 177.2);
    player.currentTime = 180; player.dispatchEvent(new Event('timeupdate'));
    assert.equal(player.currentTime, 0);
  });
});

test('menu errors do not fall back to battle, while UI effects remain available', async () => {
  await withAudio(async ({ audio, players, contexts }) => {
    audio.start('menu'); await audio.unlock();
    const warn = console.warn; console.warn = () => {};
    try { players[0].fail(); players[0].fail(); } finally { console.warn = warn; }
    await audio.unlock();
    assert.equal(players[0].loads.length, 1); assert.equal(players[0].paused, true);
    audio.ui('confirm');
    assert.equal(contexts[0].nodes.length, 2);
    assert.ok(contexts[0].nodes.every(node => node.started));
  });
});

test('pause and mute preserve position; UI is permitted on pause but combat is not', async () => {
  await withAudio(async ({ audio, players, contexts }) => {
    audio.start('menu'); await audio.unlock(); const player = players[0];
    player.currentTime = 42; audio.pause();
    assert.equal(player.paused, true);
    audio.combat('hit'); assert.equal(contexts[0].nodes.length, 0);
    audio.ui('back'); assert.equal(contexts[0].nodes.length, 1);
    assert.equal(player.paused, true);
    audio.resume(); await flush();
    assert.equal(player.currentTime, 42); assert.equal(player.paused, false);
    audio.setMuted(true); assert.equal(player.paused, true);
    audio.setMuted(false); await flush();
    assert.equal(player.currentTime, 42); assert.equal(player.paused, false);
    audio.stop(); assert.equal(player.currentTime, 0); assert.equal(player.paused, true);
    audio.start('menu'); await flush();
    assert.equal(player.currentTime, 0); assert.equal(player.paused, false);
  });
});

test('hiding pauses music and effects, return resumes the current scene only', async () => {
  await withAudio(async ({ audio, players, contexts, doc }) => {
    audio.start('menu'); await audio.unlock(); players[0].currentTime = 12;
    audio.sfx(400, .1); const tone = contexts[0].nodes.at(-1);
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'));
    assert.equal(players[0].paused, true); assert.equal(tone.disconnected, true);
    assert.equal(contexts[0].state, 'suspended');
    audio.start('battle'); await flush(); assert.equal(players[0].paused, true);
    doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); await flush();
    assert.equal(players[0].paused, false); assert.match(players[0].src, /battle-theme/);
  });
});

test('late play resolutions cannot override mute, pause, stop, or a hidden tab', async () => {
  for (const action of ['mute', 'pause', 'stop', 'hide']) {
    await withAudio(async ({ audio, players, doc }) => {
      audio.start('menu'); await audio.unlock();
      const player = players[0]; assert.equal(player.pending.length, 1);
      if (action === 'mute') audio.setMuted(true);
      else if (action === 'pause') audio.pause();
      else if (action === 'stop') audio.stop();
      else { doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); }
      player.pending[0](); await flush();
      assert.equal(player.paused, true, action);
    }, { delayedPlay: true });
  }
});

test('an old scene play promise cannot stop a newer valid scene', async () => {
  await withAudio(async ({ audio, players }) => {
    audio.start('menu'); await audio.unlock(); const player = players[0];
    audio.start('battle'); await flush();
    assert.equal(player.pending.length, 2);
    player.pending[1](); await flush();
    player.pending[0](); await flush();
    assert.equal(player.paused, false); assert.match(player.src, /battle-theme/);
  }, { delayedPlay: true });
});

test('first gesture UI sound waits for resume and only the newest pending choice is heard', async () => {
  await withAudio(async ({ audio, contexts, calls }) => {
    audio.start('menu'); audio.ui('confirm'); audio.ui('back');
    const ctx = contexts[0]; assert.equal(ctx.nodes.length, 0);
    assert.ok(calls.includes('play'), 'media play is called before resume promise settles');
    ctx.resumes.forEach(resolve => resolve()); await flush();
    assert.equal(ctx.nodes.length, 1); assert.equal(ctx.nodes[0].started, true);
    assert.equal(ctx.nodes[0].frequency.value, 330, 'the final back cue wins');
  }, { delayedResume: true });
});

test('old UI gestures are not replayed after a slow audio unlock', async () => {
  const realNow = Date.now; let now = 1000; Date.now = () => now;
  try {
    await withAudio(async ({ audio, contexts }) => {
      audio.start('menu'); audio.ui('select'); now += 251;
      contexts[0].resumes.forEach(resolve => resolve()); await flush();
      assert.equal(contexts[0].nodes.length, 0);
    }, { delayedResume: true });
  } finally { Date.now = realNow; }
});

test('rapid UI taps and combat tails have bounded voice counts', async () => {
  await withAudio(async ({ audio, contexts }) => {
    audio.start('menu'); await audio.unlock();
    for (let i = 0; i < 50; i++) audio.ui('select');
    assert.equal(contexts[0].nodes.length, 2);
    for (let i = 0; i < 50; i++) audio.combat('hit');
    assert.equal(contexts[0].nodes.filter(node => !node.disconnected).length, 16);
    audio.setMuted(true);
    assert.equal(contexts[0].nodes.filter(node => !node.disconnected).length, 0);
  });
});
