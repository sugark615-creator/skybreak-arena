import { createCombatBuffers } from './combat-sounds.mjs';

const scores = {
  menu: [new URL('./media/menu-theme.m4a', import.meta.url).href],
  battle: [
    new URL('./assets/battle-theme.mp4', import.meta.url).href,
    new URL('./assets/ignition.wav', import.meta.url).href,
  ],
};
const MUSIC_GAIN = .62;

// Stream both scores through one reusable media element instead of retaining
// two full, decoded songs in phone memory. Effects still use low-latency Web Audio.
export function createBattleAudio() {
  const host = typeof window === 'undefined' ? globalThis : window;
  const doc = typeof document === 'undefined' ? null : document;
  let ctx, master, music, player, mediaSource, combat;
  let scene = 'battle', track = 0, failed = false, pendingStart = true;
  let wanted = false, paused = false, muted = false, volume = .38;
  let generation = 0, playRequest = null, uiRequest = 0, lastUiAt = -Infinity;
  const effects = new Set();
  const hidden = () => Boolean(doc?.hidden);
  const wantsMusic = () => wanted && !paused && !muted && !hidden() && !failed;
  const canPlay = () => ctx?.state === 'running' && wantsMusic();
  const currentUrl = () => scores[scene][track];

  function clearEffects() {
    uiRequest++;
    for (const voice of effects) {
      voice.osc.onended = null;
      try { voice.osc.stop(); } catch { /* Already stopped. */ }
      voice.osc.disconnect(); voice.env.disconnect();
    }
    effects.clear();
  }

  function halt(rewind = false) {
    generation++; playRequest = null;
    player?.pause();
    if (rewind) {
      pendingStart = true;
      if (player) try { player.currentTime = loopBounds().start; } catch { /* Not loaded yet. */ }
    }
    clearEffects();
  }

  function loopBounds() {
    const duration = player?.duration;
    if (!Number.isFinite(duration) || duration <= 0) return { start: 0, end: Infinity };
    const trimmed = scene === 'battle' && track === 0;
    const start = trimmed ? Math.max(0, Math.min(.75, duration - .1)) : 0;
    return { start, end: trimmed ? Math.max(start + .1, duration - 2.83) : duration };
  }

  function seekStart() {
    if (!pendingStart || !player?.readyState) return;
    try { player.currentTime = loopBounds().start; pendingStart = false; } catch { /* Wait for metadata. */ }
  }

  function loadTrack() {
    generation++; playRequest = null; failed = false; pendingStart = true;
    player.pause(); player.src = currentUrl(); player.load();
    if (music) {
      music.gain.cancelScheduledValues(ctx.currentTime);
      music.gain.setValueAtTime(MUSIC_GAIN, ctx.currentTime);
    }
  }

  function ensurePlayer() {
    if (player) return;
    player = new host.Audio();
    player.preload = 'metadata'; player.loop = true; player.playsInline = true;
    player.addEventListener('loadedmetadata', () => {
      if (player.currentSrc && player.currentSrc !== currentUrl()) return;
      seekStart();
    });
    player.addEventListener('timeupdate', () => {
      if (!canPlay() || pendingStart) return;
      const { start, end } = loopBounds();
      if (player.currentTime >= end) player.currentTime = start;
    });
    player.addEventListener('error', () => {
      if (!player.error || (player.currentSrc && player.currentSrc !== currentUrl()) || failed) return;
      if (scene === 'battle' && track === 0) {
        track = 1; loadTrack(); launch();
      } else {
        failed = true; player.pause();
        console.warn('BGM could not be played; sound effects remain available.');
      }
    });
    loadTrack();
  }

  function launch(fromGesture = false) {
    if (!player || !wantsMusic() || (!fromGesture && !canPlay())) return;
    if (playRequest?.generation === generation || !player.paused) return;
    seekStart();
    const request = { generation };
    playRequest = request;
    // Called synchronously by unlock(), alongside AudioContext.resume(), so the
    // first iPhone tap authorizes this same element for later source changes.
    try {
      Promise.resolve(player.play()).then(() => {
        if (playRequest === request) playRequest = null;
        // A late play() completion must never undo mute, pause, stop, or hiding.
        // Do not pause a newer valid scene merely because an old promise settled.
        if (!wantsMusic()) player.pause();
      }, () => { if (playRequest === request) playRequest = null; });
    } catch { if (playRequest === request) playRequest = null; }
  }

  function resumeContext() {
    if (ctx && !hidden()) Promise.resolve(ctx.resume()).then(() => launch()).catch(() => {});
  }

  function visibilityChanged() {
    if (hidden()) {
      halt();
      if (ctx?.state === 'running') Promise.resolve(ctx.suspend()).catch(() => {});
    } else if (wanted && !paused) resumeContext();
  }

  function unlock() {
    try {
      ensurePlayer();
      if (!ctx) {
        const AudioContext = host.AudioContext || host.webkitAudioContext;
        if (!AudioContext) return Promise.resolve(false);
        ctx = new AudioContext();
        master = ctx.createGain(); music = ctx.createGain();
        master.gain.value = muted ? 0 : volume; music.gain.value = MUSIC_GAIN;
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -8; limiter.knee.value = 9; limiter.ratio.value = 5;
        mediaSource = ctx.createMediaElementSource(player);
        mediaSource.connect(music).connect(master);
        master.connect(limiter).connect(ctx.destination);
        combat = createCombatBuffers(ctx);
      }
      const ready = ctx.resume();
      if (!hidden()) launch(true);
      return Promise.resolve(ready).then(() => {
        launch(); return ctx.state === 'running';
      }).catch(() => false);
    } catch { return Promise.resolve(false); }
  }

  function start(nextScene = 'battle') {
    if (!Object.hasOwn(scores, nextScene)) return;
    const changed = scene !== nextScene;
    if (changed) { halt(); scene = nextScene; track = 0; }
    else if (!wanted) pendingStart = true;
    wanted = true; paused = false;
    doc?.addEventListener('visibilitychange', visibilityChanged);
    if (!player) ensurePlayer(); else if (changed) loadTrack();
    resumeContext();
  }

  function setVolume(value) {
    if (!Number.isFinite(value)) return;
    volume = Math.max(0, Math.min(1, value));
    master?.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, .025);
  }

  function addVoice(osc, env) {
    // Bound both UI taps and combat tails during rapid input.
    if (effects.size >= 16) {
      const oldest = effects.values().next().value;
      oldest.osc.onended = null;
      try { oldest.osc.stop(); } catch { /* Already ended. */ }
      oldest.osc.disconnect(); oldest.env.disconnect(); effects.delete(oldest);
    }
    osc.connect(env).connect(master);
    const voice = { osc, env }; effects.add(voice);
    osc.onended = () => { effects.delete(voice); osc.disconnect(); env.disconnect(); };
  }

  function duck(level, hold, release = .09) {
    const now = ctx.currentTime;
    music.gain.cancelScheduledValues(now);
    music.gain.setTargetAtTime(level, now, .008);
    music.gain.setTargetAtTime(MUSIC_GAIN, now + hold, release);
  }

  function tone(freq, duration, type, gain, delay = 0, endFrequency = freq) {
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator(), env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + .004);
    env.gain.exponentialRampToValueAtTime(.0001, now + duration);
    addVoice(osc, env); osc.start(now); osc.stop(now + duration + .02);
  }

  function sfx(freq, duration, type = 'sine', gain = .035) {
    if (!ctx || ctx.state !== 'running' || muted || hidden()) return;
    if (![freq, duration, gain].every(Number.isFinite) || gain <= 0) return;
    const length = Math.max(.025, Math.min(1.2, duration));
    tone(Math.max(40, Math.min(3500, freq)), length,
      ['sine', 'triangle', 'square', 'sawtooth'].includes(type) ? type : 'sine', Math.min(.16, gain));
    duck(.38, Math.min(length, .16));
  }

  function ui(kind = 'select') {
    const request = ++uiRequest, requestedAt = Date.now();
    const ready = unlock();
    const play = () => {
      const now = Date.now();
      if (request !== uiRequest || now - requestedAt > 250 || now - lastUiAt < 55 ||
          ctx?.state !== 'running' || muted || hidden()) return;
      lastUiAt = now;
      if (kind === 'confirm') {
        tone(660, .09, 'triangle', .13, 0, 880);
        tone(990, .14, 'sine', .11, .055, 1320);
      } else if (kind === 'back') tone(660, .13, 'triangle', .12, 0, 330);
      else {
        tone(900, .065, 'triangle', .12, 0, 1200);
        tone(1800, .035, 'sine', .035);
      }
      duck(.30, kind === 'confirm' ? .18 : .08);
    };
    if (ctx?.state === 'running') play(); else void ready.then(play);
  }

  return {
    unlock, start, setVolume, sfx, ui,
    combat(kind) {
      if (!ctx || ctx.state !== 'running' || paused || muted || hidden() || !combat?.[kind]) return;
      const now = ctx.currentTime, osc = ctx.createBufferSource(), env = ctx.createGain();
      osc.buffer = combat[kind]; osc.playbackRate.value = .96 + Math.random() * .08;
      env.gain.value = kind === 'swing' ? .36 : .68;
      addVoice(osc, env); osc.start(now);
      if (kind !== 'swing') duck(kind === 'maximum' ? .22 : .34, kind === 'maximum' ? .24 : .10, .12);
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
  };
}
