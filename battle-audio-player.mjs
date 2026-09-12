import { createCombatBuffers } from './combat-sounds.mjs';
const scoreUrls = [
  new URL('./assets/battle-theme.mp4', import.meta.url).href,
  new URL('./assets/ignition.wav', import.meta.url).href,
];
const MUSIC_GAIN = .62;

// Pre-rendered original score: one looping source, with no note scheduler.
export function createBattleAudio() {
  const host = typeof window === 'undefined' ? globalThis : window;
  const doc = typeof document === 'undefined' ? null : document;
  let ctx, master, music, buffer, preparing, source, combat;
  let wanted = false, paused = false, muted = false, volume = .38;
  let offset = 0, startedAt = 0, loopStart = 0, loopEnd = 0;
  const effects = new Set();
  const hidden = () => Boolean(doc?.hidden);
  const canPlay = () => ctx?.state === 'running' && wanted && !paused && !muted && !hidden();

  function halt(rewind = false) {
    if (source) {
      const loopDuration = loopEnd - loopStart;
      offset = (offset + ctx.currentTime - startedAt) % loopDuration;
      source.onended = null;
      try { source.stop(); } catch { /* Already stopped. */ }
      source.disconnect(); source = null;
    }
    if (rewind) offset = 0;
    for (const voice of effects) {
      voice.osc.onended = null;
      try { voice.osc.stop(); } catch { /* Already stopped. */ }
      voice.osc.disconnect(); voice.env.disconnect();
    }
    effects.clear();
  }

  function launch() {
    if (!canPlay() || !buffer || source) return;
    music.gain.cancelScheduledValues(ctx.currentTime);
    music.gain.setValueAtTime(MUSIC_GAIN, ctx.currentTime);
    source = ctx.createBufferSource();
    source.buffer = buffer; source.loop = true;
    source.loopStart = loopStart; source.loopEnd = loopEnd;
    source.connect(music);
    startedAt = ctx.currentTime;
    source.start(0, loopStart + offset);
  }

  function prepare() {
    if (preparing || buffer) return;
    const load = async index => {
      const response = await fetch(scoreUrls[index]);
      if (!response.ok) throw new Error(`BGM HTTP ${response.status}`);
      const decoded = await ctx.decodeAudioData(await response.arrayBuffer());
      // The supplied track contains silence at both ends; exclude it from playback and looping.
      loopStart = index === 0 ? Math.min(.75, decoded.duration - .1) : 0;
      loopEnd = index === 0 ? Math.max(loopStart + .1, decoded.duration - 2.83) : decoded.duration;
      return decoded;
    };
    preparing = load(0).catch(error => {
      console.warn('Custom BGM failed; using the original fallback.', error);
      return load(1);
    }).then(decoded => {
      buffer = decoded; launch();
    }).catch(error => {
      preparing = null;
      console.warn('BGM preparation failed; sound effects remain available.', error);
    });
  }

  function resumeContext() {
    if (ctx && !hidden()) Promise.resolve(ctx.resume()).then(launch).catch(() => {});
  }

  function visibilityChanged() {
    if (hidden()) {
      halt();
      if (ctx?.state === 'running') ctx.suspend().catch(() => {});
    } else if (wanted && !paused) resumeContext();
  }

  function unlock() {
    try {
      if (!ctx) {
        const Audio = host.AudioContext || host.webkitAudioContext;
        if (!Audio) return Promise.resolve(false);
        ctx = new Audio();
        master = ctx.createGain(); music = ctx.createGain();
        master.gain.value = muted ? 0 : volume;
        music.gain.value = MUSIC_GAIN;
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -8; limiter.knee.value = 9; limiter.ratio.value = 5;
        music.connect(master); master.connect(limiter).connect(ctx.destination);
        combat = createCombatBuffers(ctx);
      }
      // Must happen in the original user gesture, before fullscreen awaits.
      const ready = ctx.resume();
      prepare();
      return Promise.resolve(ready).then(() => { launch(); return ctx.state === 'running'; }).catch(() => false);
    } catch { return Promise.resolve(false); }
  }

  function start() {
    if (!wanted) offset = 0;
    wanted = true; paused = false;
    doc?.addEventListener('visibilitychange', visibilityChanged);
    if (ctx) prepare();
    resumeContext();
  }

  function setVolume(value) {
    if (!Number.isFinite(value)) return;
    volume = Math.max(0, Math.min(1, value));
    master?.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, .025);
  }

  return {
    unlock, start, setVolume,
    combat(kind) {
      if (!ctx || ctx.state !== 'running' || paused || muted || hidden() || !combat?.[kind]) return;
      // Limit overlapping tails during rapid hits without changing game timing.
      if (effects.size >= 16) {
        const oldest=effects.values().next().value;
        oldest.osc.onended=null;
        try { oldest.osc.stop(); } catch { /* Already ended. */ }
        oldest.osc.disconnect();oldest.env.disconnect();effects.delete(oldest);
      }
      const now=ctx.currentTime, osc=ctx.createBufferSource(), env=ctx.createGain();
      osc.buffer=combat[kind];osc.playbackRate.value=.96+Math.random()*.08;
      env.gain.value=kind==='swing'?.36:.68;
      osc.connect(env).connect(master);
      const voice={osc,env};effects.add(voice);
      osc.onended=()=>{effects.delete(voice);osc.disconnect();env.disconnect();};
      osc.start(now);
      if(kind!=='swing') {
        music.gain.cancelScheduledValues(now);
        music.gain.setTargetAtTime(kind==='maximum'?.22:.34,now,.006);
        music.gain.setTargetAtTime(MUSIC_GAIN,now+(kind==='maximum'?.24:.10),.12);
      }
    },
    pause() { paused = true; halt(); },
    resume() { if (wanted) { paused = false; resumeContext(); } },
    stop() {
      wanted = false; paused = false; halt(true);
      doc?.removeEventListener('visibilitychange', visibilityChanged);
    },
    setMuted(value) {
      muted = Boolean(value); setVolume(volume);
      if (muted) halt(); else resumeContext();
    },
    sfx(freq, duration, type = 'sine', gain = .035) {
      if (!ctx || ctx.state !== 'running' || muted || hidden()) return;
      if (![freq, duration, gain].every(Number.isFinite) || gain <= 0) return;
      const now = ctx.currentTime;
      const length = Math.max(.025, Math.min(1.2, duration));
      const osc = ctx.createOscillator(), env = ctx.createGain();
      osc.type = ['sine', 'triangle', 'square', 'sawtooth'].includes(type) ? type : 'sine';
      osc.frequency.value = Math.max(40, Math.min(3500, freq));
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(Math.min(.16, gain), now + .004);
      env.gain.exponentialRampToValueAtTime(.0001, now + length);
      osc.connect(env).connect(master);
      const voice = { osc, env }; effects.add(voice);
      osc.onended = () => { effects.delete(voice); osc.disconnect(); env.disconnect(); };
      osc.start(now); osc.stop(now + length + .02);
      // Briefly lower the music so hits remain audible.
      music.gain.cancelScheduledValues(now);
      music.gain.setTargetAtTime(.38, now, .008);
      music.gain.setTargetAtTime(MUSIC_GAIN, now + Math.min(length, .16), .09);
    },
  };
}
