/** Original 150 BPM synth-rock score. Call unlock() directly in a user event,
 * before awaiting fullscreen or any other promise; then call start(). */
export { createBattleAudio } from './battle-audio-player.mjs';

export function createLegacyBattleAudio() {
  const host = typeof window !== 'undefined' ? window : globalThis;
  const doc = typeof document !== 'undefined' ? document : null;
  const AudioContext = host.AudioContext || host.webkitAudioContext;
  const tick = 60 / 150 / 4;
  const progression = [45, 45, 41, 41, 48, 48, 43, 43, 45, 45, 41, 41, 43, 43, 40, 40];
  const riffs = [
    [7, null, null, 12, null, null, 7, null, 3, null, null, 7, null, null, 12, null],
    [null, null, 12, null, 7, null, null, 3, null, null, 0, null, 7, null, null, null],
    [12, null, null, 7, null, 3, null, null, 7, null, null, 12, null, null, 15, null],
    [12, null, null, null, 7, null, 3, null, 0, null, null, null, null, null, 7, null],
  ];
  let ctx, master, noiseBuffer, timer = null, nextTime = 0, step = 0;
  let unlocked = false, wanted = false, paused = false, muted = false, volume = 0.38;
  let listening = false;
  const voices = new Set();
  const hz = midi => 440 * 2 ** ((midi - 69) / 12);
  const hidden = () => Boolean(doc?.hidden);
  const canRun = () => unlocked && wanted && !paused && !muted && !hidden();

  function keep(source, nodes, at, duration) {
    const voice = { source, nodes };
    voices.add(voice);
    const release = () => {
      voices.delete(voice);
      for (const node of [source, ...nodes]) node.disconnect();
    };
    source.onended = release;
    source.start(at);
    source.stop(at + duration + 0.02);
  }

  function tone(freq, at, duration, type = 'triangle', gain = 0.035, cutoff = 2000) {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, at);
    filter.Q.value = 0.45;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + Math.min(0.009, duration / 4));
    env.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * 0.48), at + duration * 0.65);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(filter).connect(env).connect(master);
    keep(osc, [filter, env], at, duration);
  }

  function noise(at, duration, gain, cutoff, type) {
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    source.buffer = noiseBuffer;
    filter.type = type;
    filter.frequency.value = cutoff;
    filter.Q.value = 0.6;
    env.gain.setValueAtTime(gain, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(env).connect(master);
    keep(source, [filter, env], at, duration);
  }

  function kick(at) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.setValueAtTime(135, at);
    osc.frequency.exponentialRampToValueAtTime(43, at + 0.12);
    env.gain.setValueAtTime(0.001, at);
    env.gain.linearRampToValueAtTime(0.22, at + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 0.19);
    osc.connect(env).connect(master);
    keep(osc, [env], at, 0.2);
  }

  function playStep(index, at) {
    const bar = Math.floor(index / 16) % 16, beat = index % 16;
    const root = progression[bar], third = root === 45 ? 3 : 4;
    if ([0, 6, 8, 11].includes(beat) || (bar % 4 === 3 && beat === 14)) kick(at);
    if (beat === 4 || beat === 12 || (bar % 8 === 7 && beat === 15)) {
      noise(at, 0.13, 0.055, 1700, 'bandpass');
      tone(175, at, 0.075, 'triangle', 0.028, 800);
    }
    if (beat % 2 === 0 || (bar >= 8 && beat === 15)) {
      noise(at, beat === 14 ? 0.065 : 0.028, beat % 4 ? 0.01 : 0.015, 6300, 'highpass');
    }
    const bassStep = [0, 3, 6, 8, 10, 14].indexOf(beat);
    if (bassStep >= 0) {
      const offset = [0, 0, 7, 12, 0, 7][bassStep];
      tone(hz(root - 12 + offset), at, 0.19, 'sawtooth', 0.065, 520);
    }
    if ([2, 6, 10, 14].includes(beat)) {
      for (const note of [0, third, 7]) {
        tone(hz(root + 12 + note), at, 0.14, 'sawtooth', 0.014, 1350);
      }
    }
    let note = riffs[(bar + (bar >= 8 ? 1 : 0)) % 4][beat];
    if (note !== null) {
      if (note === 3) note = third;
      if (note === 15) note = 12 + third;
      tone(hz(root + 12 + note), at, beat % 4 === 0 ? 0.27 : 0.18, 'triangle', 0.044, 2200);
    }
  }

  function halt() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    for (const { source, nodes } of voices) {
      source.onended = null;
      try { source.stop(); } catch { /* Already ended. */ }
      source.disconnect();
      for (const node of nodes) node.disconnect();
    }
    voices.clear();
  }

  function pump() {
    timer = null;
    if (!canRun() || ctx.state !== 'running') { halt(); return; }
    const now = ctx.currentTime;
    // A stalled main thread never replays missed notes in a burst.
    if (nextTime < now - 0.04) nextTime = now + 0.025;
    while (nextTime < now + 0.095) {
      playStep(step, nextTime);
      step = (step + 1) % 256;
      nextTime += tick;
    }
    timer = setTimeout(pump, 25);
  }

  function launch() {
    if (!canRun() || timer !== null || ctx.state !== 'running') return;
    nextTime = ctx.currentTime + 0.035;
    pump();
  }

  function visibilityChanged() {
    if (hidden()) {
      halt();
      if (ctx?.state === 'running') ctx.suspend().catch(() => {});
    } else if (canRun()) {
      ctx.resume().then(launch).catch(() => {});
    }
  }

  function unlock() {
    if (!AudioContext) return Promise.resolve(false);
    try {
      if (!ctx) {
        ctx = new AudioContext();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : volume;
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -12;
        limiter.knee.value = 12;
        limiter.ratio.value = 5;
        master.connect(limiter).connect(ctx.destination);
        noiseBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.3), ctx.sampleRate);
        const samples = noiseBuffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      unlocked = true;
      // resume() occurs synchronously inside the original pointer/key event.
      const ready = ctx.resume();
      const silent = ctx.createBufferSource();
      silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      silent.connect(master);
      keep(silent, [], ctx.currentTime, 1 / ctx.sampleRate);
      return Promise.resolve(ready).then(() => { launch(); return ctx.state === 'running'; }).catch(() => false);
    } catch { return Promise.resolve(false); }
  }

  function start() {
    if (!wanted) step = 0;
    wanted = true;
    paused = false;
    if (!listening && doc) { doc.addEventListener('visibilitychange', visibilityChanged); listening = true; }
    if (unlocked && !hidden()) ctx.resume().then(launch).catch(() => {});
  }

  function setVolume(value) {
    if (!Number.isFinite(value)) return;
    volume = Math.max(0, Math.min(1, value));
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.025);
  }

  return {
    unlock, start,
    pause() { paused = true; halt(); },
    resume() { if (wanted) start(); },
    stop() {
      wanted = false; paused = false; step = 0; halt();
      if (listening) { doc.removeEventListener('visibilitychange', visibilityChanged); listening = false; }
    },
    setMuted(value) {
      muted = Boolean(value); setVolume(volume);
      if (muted) halt();
      else if (canRun()) ctx.resume().then(launch).catch(() => {});
    },
    setVolume,
    sfx(freq, duration, type = 'sine', gain = 0.035) {
      if (!unlocked || muted || hidden() || ctx?.state !== 'running') return;
      if (![freq, duration, gain].every(Number.isFinite)) return;
      if (gain <= 0) return;
      if (!['sine', 'triangle', 'square', 'sawtooth'].includes(type)) type = 'sine';
      tone(Math.max(40, Math.min(3500, freq)), ctx.currentTime, Math.max(0.025, Math.min(1.2, duration)),
        type, Math.max(0.001, Math.min(0.16, gain)), 2400);
    },
  };
}
