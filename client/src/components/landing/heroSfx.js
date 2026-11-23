/**
 * Synthesised sound effects for the landing hero (Web Audio, no files).
 * Separate from utils/audioFeedback.js: those are loud gate-scanner tones with
 * haptics; these are soft, short, and silent unless the visitor turns sound on.
 */

let ctx = null;
let master = null;
let noiseBuf = null;

const audio = () => {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
};

// One enveloped oscillator note
const tone = (freq, { at = 0, dur = 0.12, type = 'sine', vol = 0.3, slideTo = null } = {}) => {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
};

// Filtered white-noise burst (slaps, whooshes, thuds)
const noise = ({ at = 0, dur = 0.15, vol = 0.3, type = 'bandpass', freq = 1500, freqTo = null, q = 1 } = {}) => {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
};

// Each character "talks" in blips, game-style: Flash-chan high and bright, Gate-kun low and calm
const VOICES = {
  flash: { base: 760, spread: 260, type: 'triangle', vol: 0.16, gap: 0.062 },
  gate: { base: 240, spread: 90, type: 'square', vol: 0.07, gap: 0.078 }
};

const play = (fn) => {
  try {
    if (!audio()) return;
    fn();
  } catch (e) {
    // Sound is decoration — never let it break the hero
  }
};

export const heroSfx = {
  // Call from a click so browsers allow audio, then confirm with a tiny chime
  unlock: () => play(() => {
    tone(880, { dur: 0.09, type: 'triangle', vol: 0.15 });
    tone(1320, { at: 0.08, dur: 0.14, type: 'triangle', vol: 0.12 });
  }),

  talk: (who, text = '') => play(() => {
    const v = VOICES[who] || VOICES.flash;
    const count = Math.min(7, Math.max(3, Math.round(text.replace(/[^a-z]/gi, '').length / 4)));
    for (let i = 0; i < count; i++) {
      const f = v.base + (Math.random() - 0.5) * v.spread;
      tone(f, { at: i * v.gap, dur: 0.05, type: v.type, vol: v.vol });
    }
  }),

  // Scanner: laser hum + two quick beeps
  scan: () => play(() => {
    tone(140, { dur: 0.7, type: 'sawtooth', vol: 0.03, slideTo: 220 });
    tone(1760, { at: 0.05, dur: 0.07, vol: 0.18 });
    tone(1760, { at: 0.18, dur: 0.07, vol: 0.18 });
  }),

  // ENTRY OK: bright rising arpeggio
  ok: () => play(() => {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, { at: i * 0.07, dur: 0.22, type: 'triangle', vol: 0.16 }));
  }),

  // ALREADY INSIDE: two low buzzes
  denied: () => play(() => {
    tone(175, { dur: 0.16, type: 'square', vol: 0.12 });
    tone(165, { at: 0.2, dur: 0.24, type: 'square', vol: 0.12 });
  }),

  // Gate-kun's palm stops her: soft body thud
  blocked: () => play(() => {
    tone(170, { dur: 0.25, vol: 0.35, slideTo: 45 });
    noise({ dur: 0.12, vol: 0.25, type: 'lowpass', freq: 600 });
  }),

  // High-five slap + sparkle
  highfive: () => play(() => {
    noise({ dur: 0.09, vol: 0.45, freq: 2200, q: 0.8 });
    [2637, 3136, 3951].forEach((f, i) => tone(f, { at: 0.06 + i * 0.05, dur: 0.12, vol: 0.06 }));
  }),

  // Jump-spin whoosh
  whoosh: () => play(() => {
    noise({ dur: 0.45, vol: 0.18, freq: 350, freqTo: 2600, q: 2 });
  }),

  // Sneaking out: soft tiptoe pizzicato
  sneak: () => play(() => {
    [784, 659, 784, 587].forEach((f, i) => tone(f, { at: i * 0.22, dur: 0.08, type: 'triangle', vol: 0.09 }));
  })
};
