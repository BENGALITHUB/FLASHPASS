import React, { useEffect, useRef, useState } from 'react';
import { ShieldAlert, MousePointerClick, Volume2, VolumeX } from 'lucide-react';
import { createHeroScene } from './heroScene';
import { heroSfx } from './heroSfx';

const GAP_MS = 260; // pause between one bubble closing and the next opening
const LINE_MS = 1900;
const SOUND_KEY = 'fp_hero_sound';

// Sound per scan beat (lines also get each character's voice blips)
const BEAT_SFX = {
  scan: heroSfx.scan,
  ok: () => { heroSfx.ok(); heroSfx.whoosh(); },
  denied: heroSfx.denied,
  blocked: heroSfx.blocked,
  highfive: heroSfx.highfive,
  inside: heroSfx.whoosh,
  sneak: heroSfx.sneak
};

// Idle conversation — one speaker at a time, alternating
const IDLE_TALK = [
  { who: 'flash', text: 'Pass ready! Zero queues ⚡' },
  { who: 'gate', text: 'Gate 1 online ✓' },
  { who: 'flash', text: 'Do screenshots work here?' },
  { who: 'gate', text: 'Nope! Anti-screenshot trap 🛡️' },
  { who: 'flash', text: 'How fast is the scan?' },
  { who: 'gate', text: 'Under 0.5s! ⚡' },
  { who: 'flash', text: 'Tap us for a live scan!' },
  { who: 'gate', text: 'Anti-passback: ARMED 🛡️' }
];

// Scripted lines per scan beat, written so the speakers alternate (kind is 'ok' or 'denied')
const BEAT_LINES = {
  present: (k) => [{ who: 'flash', text: k === 'denied' ? 'Let me in again! 😇' : "Here's my FlashPass! ⚡" }],
  scan: () => [{ who: 'gate', text: 'Scanning… BEEP! 📟' }],
  ok: () => [{ who: 'flash', text: 'Green light! Zero queues 🎉', tone: 'ok' }],
  highfive: () => [{ who: 'gate', text: 'Enjoy the carnival! ✋' }],
  inside: () => [{ who: 'flash', text: "I'm in! 🎪" }],
  sneak: () => [
    { who: 'gate', text: "Hey… where's she going? 🤨", ms: 1300 },
    { who: 'flash', text: 'Shh… no exit scan 🤫', ms: 1600 }
  ],
  denied: () => [{ who: 'flash', text: "Huh?! I'm going in anyway 💨" }],
  blocked: () => [
    { who: 'gate', text: 'STOP ✋ Already inside!', tone: 'denied', ms: 1500 },
    { who: 'flash', text: 'Oof! 😵 Busted…', ms: 1600 }
  ]
};
const POWS = ['POW!', 'ZAP!', 'BAM!', 'FLASH!'];

function Bubble({ text, side, tone = 'default' }) {
  const tones = {
    default: 'bg-white text-black',
    ok: 'bg-success text-white',
    denied: 'bg-danger text-white'
  };
  const tail = { default: 'bg-white', ok: 'bg-success', denied: 'bg-danger' };
  return (
    <div
      className={`hero-bubble relative max-w-[170px] sm:max-w-[240px] ${tones[tone]} font-comic text-sm sm:text-lg leading-tight tracking-wide px-3 py-1.5 sm:px-4 sm:py-2 rounded-2xl border-[3px] border-black shadow-[4px_4px_0_#000]`}
      style={{ transformOrigin: side === 'left' ? 'bottom right' : 'bottom left' }}
    >
      {text}
      <span
        className={`absolute -bottom-[11px] ${side === 'left' ? 'right-6' : 'left-6'} w-4 h-4 ${tail[tone]} border-r-[3px] border-b-[3px] border-black rotate-45`}
      />
    </div>
  );
}

export default function AnimeHero3D() {
  const mountRef = useRef(null);
  const rootRef = useRef(null);
  const [line, setLine] = useState(null); // { who, text, tone, id } — only one speaker at a time
  const [pow, setPow] = useState(null);
  const [failed, setFailed] = useState(false);
  // Off by default; remembered per visitor
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) === '1';
    } catch {
      return false;
    }
  });
  const soundRef = useRef(soundOn);
  const inViewRef = useRef(true);

  const toggleSound = () => {
    const on = !soundRef.current;
    soundRef.current = on;
    setSoundOn(on);
    try {
      localStorage.setItem(SOUND_KEY, on ? '1' : '0');
    } catch {}
    if (on) heroSfx.unlock();
  };

  // Only make noise while the hero is actually on screen
  useEffect(() => {
    const io = new IntersectionObserver(([entry]) => {
      inViewRef.current = entry.isIntersecting;
    });
    if (rootRef.current) io.observe(rootRef.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const sfx = (fn) => {
      if (soundRef.current && inViewRef.current && document.visibilityState === 'visible') fn?.();
    };
    let queue = [];
    let timer = 0;
    let busy = false; // a scan round is playing
    let idleIdx = 0;
    let lineId = 0;

    // Close the current bubble, wait a beat, then open the next one in the queue
    const next = () => {
      clearTimeout(timer);
      setLine(null);
      if (!queue.length && !busy) queue.push(IDLE_TALK[idleIdx++ % IDLE_TALK.length]);
      if (!queue.length) return;
      timer = setTimeout(() => {
        const l = queue.shift();
        setLine({ ...l, id: ++lineId });
        sfx(() => heroSfx.talk(l.who, l.text));
        // The last scripted line of a beat stays up until the next beat (or a fallback timeout)
        timer = setTimeout(next, l.ms ?? LINE_MS);
      }, GAP_MS);
    };
    const say = (lines) => {
      queue = [...lines];
      next();
    };

    let ctrl;
    try {
      ctrl = createHeroScene(mountRef.current, {
        reducedMotion,
        onBeat: (name, kind) => {
          if (name === 'end') {
            busy = false;
            return;
          }
          busy = true;
          sfx(BEAT_SFX[name]);
          const lines = BEAT_LINES[name]?.(kind);
          if (lines) say(lines);
          if (name === 'ok') setPow({ id: Date.now(), text: POWS[Math.floor(Math.random() * POWS.length)], tone: 'ok' });
          if (name === 'denied') setPow({ id: Date.now(), text: 'BZZT!', tone: 'denied' });
          if (name === 'blocked') setPow({ id: Date.now(), text: 'BLOCKED!', tone: 'denied' });
          if (name === 'highfive') setPow({ id: Date.now(), text: 'HIGH FIVE!', tone: 'ok' });
        }
      });
    } catch (e) {
      console.error('3D hero failed to start', e);
      setFailed(true);
    }
    next();
    return () => {
      clearTimeout(timer);
      ctrl?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!pow) return;
    const to = setTimeout(() => setPow(null), 900);
    return () => clearTimeout(to);
  }, [pow]);

  return (
    <div ref={rootRef} className="relative w-full h-full select-none">
      {/* Anime speed rays + glow behind the characters */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[2rem]">
        <div className="hero-rays absolute left-1/2 top-[42%] w-[160%] aspect-square -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute left-[30%] top-[40%] w-[50%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute left-[70%] top-[40%] w-[45%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full bg-info/20 blur-3xl" />
        <div className="absolute left-[25%] top-[62%] w-[50%] aspect-square -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />
      </div>

      <div
        ref={mountRef}
        className="absolute inset-0"
        aria-label="Flash-chan scans her FlashPass with Gate-kun at the entry gate; re-entry without an exit scan gets blocked"
        role="img"
      />

      {failed && (
        <div className="absolute inset-0 flex items-center justify-center font-comic text-6xl text-primary drop-shadow-[4px_4px_0_#000]">
          ⚡ FLASH!
        </div>
      )}

      {/* One speech bubble at a time: over Flash-chan (left) or Gate-kun (right) */}
      <div className="absolute inset-0 pointer-events-none" aria-live="polite">
        {line && (
          <div
            key={line.id}
            className={`absolute ${line.who === 'flash' ? 'top-[3%] left-[2%] sm:left-[6%]' : 'top-[10%] right-[2%] sm:right-[6%]'}`}
          >
            <Bubble text={line.text} side={line.who === 'flash' ? 'left' : 'right'} tone={line.tone} />
          </div>
        )}
      </div>

      {/* POW burst on verdicts, high-five and block */}
      {pow && (
        <div className="absolute inset-x-0 top-[24%] flex justify-center pointer-events-none">
          <div key={pow.id} className="hero-pow">
            <div
              className={`font-comic text-4xl sm:text-6xl px-5 py-2 border-[3px] border-black rounded-xl shadow-[5px_5px_0_#000] -rotate-6 ${
                pow.tone === 'denied' ? 'bg-danger text-white' : 'bg-accent text-primary'
              }`}
            >
              {pow.text}
            </div>
          </div>
        </div>
      )}

      {/* Floating stat badges */}
      <div className="hidden sm:block absolute left-0 bottom-[12%] animate-float pointer-events-none">
        <div className="bg-surface/90 backdrop-blur border-2 border-primary rounded-2xl p-2.5 shadow-[4px_4px_0_#000] flex items-center gap-2 font-mono text-xs">
          <span className="w-2.5 h-2.5 rounded-full bg-success animate-ping" />
          <span className="text-primary font-bold">&lt; 500ms Scan Latency</span>
        </div>
      </div>
      <div className="hidden sm:block absolute right-0 bottom-[12%] animate-float-delayed pointer-events-none">
        <div className="bg-surface/90 backdrop-blur border-2 border-accent rounded-2xl p-2.5 shadow-[4px_4px_0_#000] flex items-center gap-2 font-mono text-xs">
          <ShieldAlert className="w-4 h-4 text-accent" />
          <span className="text-accent font-bold">Anti-Passback Gate</span>
        </div>
      </div>

      <div className="absolute bottom-1 inset-x-2 flex flex-wrap justify-center items-center gap-x-3 gap-y-1.5 text-center font-mono text-[10px] text-text-muted/80 pointer-events-none">
        <span className="inline-flex items-center gap-1.5">
          <MousePointerClick className="w-3.5 h-3.5" /> Move your cursor • tap to scan a pass
        </span>
        <button
          type="button"
          onClick={toggleSound}
          aria-pressed={soundOn}
          aria-label={soundOn ? 'Turn hero sound off' : 'Turn hero sound on'}
          className={`pointer-events-auto inline-flex min-h-8 items-center gap-1.5 rounded-full border-2 px-3 font-mono text-[10px] font-bold uppercase tracking-wider shadow-[2px_2px_0_#000] transition-colors ${
            soundOn
              ? 'border-black bg-primary text-black'
              : 'border-border bg-surface/90 text-text-muted hover:border-primary hover:text-primary'
          }`}
        >
          {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          {soundOn ? 'Sound on' : 'Sound off'}
        </button>
      </div>
    </div>
  );
}
