import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, Link } from 'react-router-dom';
import {
  MapPin, CalendarDays, Users, Smartphone, Clock, CheckCircle2, RefreshCw,
  Building2, Store, HeartHandshake, ArrowRight, Crown, Ticket, Banknote, Zap, Flame, Timer,
  Shirt, Coffee, Car, ShoppingBag, ChevronDown, ShieldCheck
} from 'lucide-react';
import { stockInfo } from '../../utils/stock';
import { skinFor } from './eventSkins';

// Merch tile icon per add-on category
const ADDON_ICONS = { MERCH: Shirt, FOOD: Coffee, PARKING: Car, VIP_PERK: Crown };

// Brand-palette themes, rotated per card so neighbouring events never look
// identical while every newly created event stays on-brand.
const THEMES = [
  { a: '#FFD60A', b: '#FF2E88', text: '#FFD60A' },
  { a: '#22D3EE', b: '#FF2E88', text: '#22D3EE' },
  { a: '#FF2E88', b: '#FFD60A', text: '#FF2E88' },
  { a: '#FFD60A', b: '#22D3EE', text: '#FFD60A' }
];

const TIER_THEMES = [
  { accent: '#22D3EE', label: 'text-black', btn: 'bg-info text-black hover:brightness-110' },
  { accent: '#FFD60A', label: 'text-black', btn: 'bg-primary text-black hover:bg-primary-dark' },
  { accent: '#FF2E88', label: 'text-white', btn: 'bg-accent text-white hover:bg-accent-hover' }
];

function formatDateRange(days = []) {
  const dates = days
    .map((d) => new Date(d.date))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((x, y) => x - y);
  if (dates.length === 0) return null;
  const fmt = (d, opts) => d.toLocaleDateString('en-IN', opts);
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (dates.length === 1) return fmt(first, { day: 'numeric', month: 'short', year: 'numeric' });
  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()}–${fmt(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return `${fmt(first, { day: 'numeric', month: 'short' })} – ${fmt(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

// Event days are plain YYYY-MM-DD strings; treat them as local calendar days
function eventWindow(days = []) {
  const dates = days
    .map((d) => new Date(`${d.date}T00:00:00`))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((x, y) => x - y);
  if (dates.length === 0) return null;
  const end = new Date(dates[dates.length - 1]);
  end.setDate(end.getDate() + 1);
  return { start: dates[0], end };
}

// Live countdown label: 'Starts in 3d 4h' before the event, 'Happening now' during it
function useEventCountdown(days) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const win = eventWindow(days);
  if (!win || now >= win.end.getTime()) return null;
  const ms = win.start.getTime() - now;
  if (ms <= 0) return { live: true, label: 'Happening now' };
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return { live: false, label: d > 0 ? `Starts in ${d}d ${h}h` : `Starts in ${h}h ${m}m` };
}

function initials(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '★';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// A paragraph that opens with an emoji ("🔥 KOLKATA COMICS…") becomes a highlight row.
const LEADING_EMOJI = /^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:️|‍(?:\p{Extended_Pictographic}))*)\s*/u;

// An event's own look: a dark glass panel with its colour as the accent and offset shadow, an
// "About the event" sticker, the first paragraph as a headline, emoji paragraphs as highlight
// rows, and the rest folded under a fade until "Read more".
function BrandedDescription({ text, band }) {
  const [open, setOpen] = useState(false);
  const paragraphs = String(text).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const [lead, ...rest] = paragraphs;
  const long = rest.length > 1 || rest.join(' ').length > 220;
  const shown = !long || open ? rest : rest.slice(0, 2);

  return (
    <section
      className="relative max-w-2xl !mt-6 rounded-2xl border-2 p-4 pt-6 sm:p-6 sm:pt-7 backdrop-blur-sm font-sans"
      style={{ borderColor: band, background: 'linear-gradient(160deg, rgba(255,122,26,0.14), rgba(10,10,10,0.78) 45%)', boxShadow: `5px 5px 0 ${band}` }}
    >
      <span className="absolute -top-3 left-4 px-2.5 py-0.5 rounded-md border-2 border-black font-display text-sm tracking-[0.18em] text-black shadow-[2px_2px_0_#000]" style={{ background: band }}>
        About the event
      </span>

      <p className="text-[15px] sm:text-lg font-semibold leading-snug text-white whitespace-pre-line">{lead}</p>

      <div className={`relative mt-3 space-y-2.5 ${long && !open ? 'max-h-36 overflow-hidden' : ''}`}>
        {shown.map((p, i) => {
          const emoji = p.match(LEADING_EMOJI);
          return emoji ? (
            <div key={i} className="flex items-start gap-3 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5">
              <span className="grid place-items-center w-8 h-8 shrink-0 rounded-full text-base" style={{ background: `${band}26`, boxShadow: `inset 0 0 0 1px ${band}66` }} aria-hidden="true">{emoji[1]}</span>
              <p className="pt-1 text-[13px] sm:text-sm leading-relaxed text-white/85 whitespace-pre-line">{p.slice(emoji[0].length)}</p>
            </div>
          ) : (
            <p key={i} className="text-[13px] sm:text-sm leading-relaxed text-white/70 whitespace-pre-line">{p}</p>
          );
        })}
        {long && !open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0d0b0a] to-transparent" />}
      </div>

      {long && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full border-2 border-black px-3.5 py-1.5 font-display text-sm tracking-[0.14em] text-black shadow-[2px_2px_0_#000] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
          style={{ background: band }}
        >
          {open ? 'Show less' : 'Read more'}
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
    </section>
  );
}

// The organizer's description, as they wrote it: blank lines start new paragraphs. The first
// paragraph leads in brighter type; the rest fold away behind "Read more" when it runs long.
// With `band` set (an event's own colour) it uses the event's branded panel instead.
function EventDescription({ text, accent, band = null }) {
  const [open, setOpen] = useState(false);
  const paragraphs = String(text).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const [lead, ...rest] = paragraphs;
  const long = rest.length > 1 || rest.join(' ').length > 220;
  const shown = !long || open ? rest : rest.slice(0, 1);

  if (band) return <BrandedDescription text={text} band={band} />;

  return (
    <div
      className={`max-w-2xl space-y-2.5 font-sans ${band ? 'rounded-2xl border-2 border-black p-4 sm:p-5 shadow-[4px_4px_0_#000]' : ''}`}
      style={band ? { background: band } : undefined}
    >
      <p className={`text-sm sm:text-base leading-relaxed whitespace-pre-line ${band ? 'text-black font-semibold tracking-[0.02em]' : 'text-white/90'}`}>{lead}</p>
      {shown.map((p, i) => (
        <p key={i} className={`text-[13px] sm:text-sm leading-relaxed whitespace-pre-line ${band ? 'text-black/80 tracking-[0.02em]' : 'text-text-muted'}`}>{p}</p>
      ))}
      {long && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="inline-flex items-center gap-1 font-mono text-[11px] font-bold uppercase tracking-wider hover:underline cursor-pointer"
          style={{ color: band ? '#000' : accent }}
        >
          {open ? 'Show less' : 'Read more'}
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
    </div>
  );
}

// The price in a jagged starburst, like a poster price sticker.
const BURST_POINTS = Array.from({ length: 36 }, (_, i) => {
  const angle = (Math.PI * 2 * i) / 36 - Math.PI / 2;
  const radius = i % 2 ? 41 : 50;
  return `${(50 + radius * Math.cos(angle)).toFixed(2)},${(50 + radius * Math.sin(angle)).toFixed(2)}`;
}).join(' ');
function PriceBurst({ color, rupees, size = 'lg', ribbon = null }) {
  const whole = Number(rupees);
  const label = Number.isFinite(whole) ? (whole % 1 ? whole.toFixed(2) : String(whole)) : rupees;
  return (
    <div className={`relative grid place-items-center shrink-0 ${size === 'lg' ? 'w-28 h-28 lg:w-40 lg:h-40 lg:my-2' : 'w-28 h-28 lg:w-32 lg:h-32'}`}>
      <svg viewBox="0 0 100 100" className="kck-sway absolute inset-0 w-full h-full drop-shadow-[4px_4px_0_#000]" aria-hidden="true">
        <polygon points={BURST_POINTS} fill={color} stroke="#000" strokeWidth="1.5" strokeLinejoin="round" />
        <polygon points={BURST_POINTS} fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1" transform="translate(50 50) scale(0.86) translate(-50 -50)" />
      </svg>
      <span className={`relative font-display text-black leading-none flex items-start ${size === 'lg' ? 'text-5xl lg:text-7xl' : 'text-5xl lg:text-6xl'}`}>
        {label}<span className="text-[0.5em] mt-[0.12em] ml-0.5">₹</span>
      </span>
      {ribbon && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rotate-[-6deg] whitespace-nowrap rounded-md border-2 border-black bg-[#E10600] px-2 py-0.5 font-display text-[11px] lg:text-xs tracking-[0.14em] text-white shadow-[2px_2px_0_#000]">
          {ribbon}
        </span>
      )}
    </div>
  );
}

// Backdrop for an event with its own look: a Kolkata dusk. A warm sky and a setting sun behind
// the Howrah Bridge and Victoria Memorial in silhouette, over the Hooghly. The river mirrors the
// city and the sun the way still water does: a darkened, rippling reflection and a long
// trembling sun path, with fine ripple lines drifting across. Decorative, on every screen size.
const RIPPLES = [
  [250, 184, 46], [338, 190, 30], [612, 186, 54], [700, 193, 36], [290, 199, 64], [655, 201, 44],
  [230, 208, 40], [372, 211, 28], [600, 210, 58], [735, 214, 34], [310, 216, 50], [520, 196, 24]
];

// A swell on the water: a short wavy line centred on cx, `half` wide each side, just below the
// waterline. CSS moves it towards the viewer (down) while it widens, like water coming closer.
const swellPath = (cx, half, amp) => {
  const y = 178;
  const seg = half / 3;
  let d = `M${cx - half} ${y}`;
  for (let i = 0; i < 6; i++) d += ` q${seg / 2} ${i % 2 ? amp : -amp} ${seg} 0`;
  return d;
};
// Several lanes of swells, staggered so the river keeps flowing out from under the bridge.
const TOWARD = Array.from({ length: 12 }, (_, i) => ({
  cx: [500, 430, 570, 360, 640, 500][i % 6],
  half: [70, 46, 46, 38, 38, 90][i % 6],
  amp: 1.6,
  dur: 6,
  delay: -(i * 0.5),
  color: i % 3 === 0 ? '#FFE3A8' : '#FFB56B'
}));

function KolkataSkyline({ orange, red, className, viewBox = '150 0 760 220', fit = 'xMidYMax slice' }) {
  const ink = '#0A0A0A';
  // Unique ids: the skyline can be on the page twice (phone strip and panel backdrop).
  const uid = useId().replace(/:/g, '');
  const id = name => `${name}-${uid}`;
  const [animate] = useState(() => typeof window === 'undefined' || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  // Howrah Bridge: two lattice towers, cantilever arms and the suspended middle span.
  const towers = [380, 620];
  const topChord = 'M232 168 L300 150 L380 58 L452 112 L548 112 L620 58 L700 150 L768 168';
  const lattice = [];
  const chordY = x => {
    const pts = [[232, 168], [300, 150], [380, 58], [452, 112], [548, 112], [620, 58], [700, 150], [768, 168]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i]; const [x2, y2] = pts[i + 1];
      if (x >= x1 && x <= x2) return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
    }
    return 168;
  };
  for (let x = 244; x < 760; x += 24) {
    lattice.push(`M${x} 170 L${x + 12} ${chordY(x + 12)}`, `M${x + 24} 170 L${x + 12} ${chordY(x + 12)}`);
  }
  const WATER = 176;

  return (
    <svg className={className} viewBox={viewBox} preserveAspectRatio={fit}>
      <defs>
        <radialGradient id={id('sun')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFE14A" />
          <stop offset="55%" stopColor={orange} />
          <stop offset="100%" stopColor={red} stopOpacity="0" />
        </radialGradient>
        {/* Water: the warm sky mirrored near the bank, deepening to night further out */}
        <linearGradient id={id('water')} x1="0" y1={WATER} x2="0" y2="220" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#B4521C" />
          <stop offset="45%" stopColor="#5A2614" />
          <stop offset="100%" stopColor="#140A0A" />
        </linearGradient>
        {/* Sun path on the water: bright under the sun, thinning out towards the viewer */}
        <linearGradient id={id('glow')} x1="0" y1={WATER} x2="0" y2="220" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFE58A" stopOpacity="0.95" />
          <stop offset="100%" stopColor={orange} stopOpacity="0.15" />
        </linearGradient>
        {/* Reflections fade as the water deepens */}
        <linearGradient id={id('fade')} x1="0" y1={WATER} x2="0" y2="220" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0.1" />
        </linearGradient>
        <mask id={id('fadeMask')} maskUnits="userSpaceOnUse" x="0" y={WATER} width="1000" height="44">
          <rect x="0" y={WATER} width="1000" height="44" fill={`url(#${id('fade')})`} />
        </mask>
        <clipPath id={id('river')}>
          <rect x="0" y={WATER} width="1000" height="44" />
        </clipPath>
        {/* Moving water bends what it mirrors: horizontal noise displaces the reflections */}
        <filter id={id('ripple')} x="-5%" y="-20%" width="110%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.16" numOctaves="2" seed="7" result="noise">
            {animate && <animate attributeName="baseFrequency" dur="9s" values="0.004 0.16;0.006 0.22;0.004 0.16" repeatCount="indefinite" />}
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="12" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* The city once, drawn again upside down in the river */}
        <g id={id('city')}>
          <path fill={ink} opacity="0.55" d="M0 175 V150 h30 v-14 h22 v20 h26 v-30 h18 v30 h30 v-12 h24 v22 h40 V175 Z M820 175 V146 h26 v-18 h20 v24 h34 v-28 h22 v28 h40 v-10 h58 V175 Z" />
          <g stroke={ink} fill="none" strokeLinejoin="round">
            <path d={topChord} strokeWidth="6" />
            <path d={lattice.join(' ')} strokeWidth="2.2" />
            <path d="M222 170 H778" strokeWidth="7" />
          </g>
          {towers.map(x => (
            <g key={x} fill={ink}>
              <path d={`M${x - 16} 176 L${x - 7} 50 L${x + 7} 50 L${x + 16} 176 Z`} />
              <rect x={x - 3} y="38" width="6" height="14" />
            </g>
          ))}
          {/* Victoria Memorial, a little smaller, just right of the bridge */}
          <g fill={ink} transform="translate(784 176) scale(0.75) translate(-822 -176)">
            <rect x="822" y="150" width="128" height="26" />
            <rect x="846" y="132" width="80" height="20" />
            <rect x="862" y="118" width="48" height="16" />
            <path d="M864 120 Q886 76 908 120 Z" />
            <rect x="883" y="66" width="6" height="16" />
            <path d="M886 52 l7 12 h-14 Z" />
            <rect x="822" y="136" width="10" height="16" />
            <rect x="940" y="136" width="10" height="16" />
          </g>
        </g>
      </defs>

      {/* Setting sun behind the bridge */}
      <circle cx="500" cy="150" r="120" fill={`url(#${id('sun')})`} opacity="0.55" />
      <circle cx="500" cy="150" r="58" fill="#FFD23A" opacity="0.5" />

      {/* The city */}
      <use href={`#${id('city')}`} />

      {/* The Hooghly */}
      <g clipPath={`url(#${id('river')})`}>
        <rect x="0" y={WATER} width="1000" height="44" fill={`url(#${id('water')})`} />
        {/* Sun path, trembling */}
        <g filter={`url(#${id('ripple')})`}>
          <path d={`M455 ${WATER} H545 L522 220 H478 Z`} fill={`url(#${id('glow')})`} opacity="0.85" />
          <ellipse cx="500" cy={WATER + 3} rx="70" ry="4" fill="#FFF1B0" opacity="0.7" />
        </g>
        {/* The city's reflection: mirrored at the waterline, darkened, rippling and fading */}
        <g filter={`url(#${id('ripple')})`} mask={`url(#${id('fadeMask')})`}>
          <use href={`#${id('city')}`} transform={`translate(0 ${WATER * 2}) scale(1 -1)`} />
        </g>
        {/* The current coming out from under the bridge towards the viewer: wavy swells start
            small and faint at the far water, then widen, brighten and sink as they near. */}
        {TOWARD.map(({ cx, half, amp, dur, delay, color }, i) => (
          <path
            key={`toward-${i}`}
            d={swellPath(cx, half, amp)}
            fill="none"
            stroke={color}
            strokeWidth="1.3"
            strokeLinecap="round"
            className={animate ? 'kck-toward' : undefined}
            style={{ transformOrigin: `${cx}px ${WATER + 2}px`, animationDuration: `${dur}s`, animationDelay: `${delay}s`, opacity: animate ? undefined : 0.35 - i * 0.03 }}
          />
        ))}
        {/* Still ripples catching the light */}
        {RIPPLES.map(([x, y, len], i) => (
          <path key={i} d={`M${x} ${y} h${len}`} stroke={i % 3 === 0 ? '#FFE7B8' : '#FFB067'} strokeOpacity={0.14 + (i % 4) * 0.05} strokeWidth="0.8" strokeLinecap="round" />
        ))}
        {/* Haze where the water meets the sky */}
        <rect x="0" y={WATER} width="1000" height="3" fill="#FFC27A" opacity="0.25" />
      </g>

      {/* River banks either side of the bridge */}
      <path fill={ink} d="M0 172 H246 L262 180 H0 Z M1000 172 H754 L738 180 H1000 Z" />
    </svg>
  );
}

function SkinBackdrop({ skin }) {
  const { orange, burst, red } = skin.colors;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      {/* Dusk sky: warm at the horizon, night at the top */}
      <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 0%, ${red}1f 45%, ${orange}47 78%, ${orange}5c 100%)` }} />
      {/* Logo-colour glows */}
      <div className="absolute -top-24 -left-20 w-80 h-80 rounded-full blur-3xl opacity-[0.28]" style={{ background: red }} />
      <div className="absolute top-1/4 -right-24 w-96 h-96 rounded-full blur-3xl opacity-[0.2]" style={{ background: '#1E5BFF' }} />
      {/* Halftone dots, thickest towards the sky's glow */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(${burst}55 1.3px, transparent 1.8px)`,
          backgroundSize: '13px 13px',
          WebkitMaskImage: 'linear-gradient(180deg, transparent 25%, #000 90%)',
          maskImage: 'linear-gradient(180deg, transparent 25%, #000 90%)',
          opacity: 0.4
        }}
      />
      {/* The logo as a faint stamp, centred and enlarged in the background. */}
      <img
        src={skin.watermarkLogo || skin.logo}
        alt=""
        className="absolute left-1/2 -translate-x-1/2 top-[52%] -translate-y-1/2 w-[92%] rotate-[-6deg] opacity-[0.20] md:top-[46%] md:w-[34rem] lg:w-[40rem] md:max-w-[95%] md:opacity-[0.18] select-none"
      />
      {/* Tablets and up: the skyline across the foot of the panel. Phones get it as its own strip. */}
      <KolkataSkyline orange={orange} red={red} className="hidden md:block absolute inset-x-0 bottom-0 w-full md:h-[34%] lg:h-[28%]" />
    </div>
  );
}

// The price stub's own art for an event with its own look: a warm glow and faint rays behind the
// price burst and a halftone fade at the foot.
function StubBackdrop({ skin }) {
  const { burst, orange } = skin.colors;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 w-[140%] aspect-square">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background: `repeating-conic-gradient(from 0deg, ${burst}1f 0deg 5deg, transparent 5deg 15deg)`,
            WebkitMaskImage: 'radial-gradient(circle, #000 10%, transparent 55%)',
            maskImage: 'radial-gradient(circle, #000 10%, transparent 55%)'
          }}
        />
        <div className="absolute inset-[28%] rounded-full blur-3xl opacity-40" style={{ background: `radial-gradient(circle, ${burst}, ${orange} 55%, transparent 72%)` }} />
      </div>
      <div
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{
          backgroundImage: `radial-gradient(${orange}66 1.2px, transparent 1.7px)`,
          backgroundSize: '12px 12px',
          WebkitMaskImage: 'linear-gradient(180deg, transparent, #000)',
          maskImage: 'linear-gradient(180deg, transparent, #000)',
          opacity: 0.45
        }}
      />
    </div>
  );
}

// Phones book from a bar pinned to the bottom of the screen, like an app's checkout bar. It slides
// in while its event card is on screen, so the price and button are always under the thumb.
function MobileBookingBar({ show, skin, theme, priceLabel, totalRupees, dateRange, soldOut, onBook }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className={`md:hidden fixed inset-x-0 bottom-0 z-[60] px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-all duration-300 ease-out ${show ? 'translate-y-0 opacity-100 visible' : 'translate-y-full opacity-0 invisible'}`}
      aria-hidden={!show}
    >
      <div
        className="flex items-center gap-3 rounded-2xl border-2 border-black p-2.5 pl-3.5 shadow-[0_-8px_30px_rgba(0,0,0,0.55),4px_4px_0_#000] backdrop-blur-md"
        style={{ background: skin ? 'rgba(17,17,17,0.94)' : 'rgba(18,18,36,0.94)' }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className={`leading-none ${skin ? 'font-display text-3xl' : 'font-comic text-2xl'}`} style={{ color: theme.a }}>₹{priceLabel}</span>
            <span className="font-mono text-[10px] text-white/60">/ person</span>
          </div>
          <span className="block truncate font-mono text-[10px] text-white/70">{dateRange || 'Instant digital pass'}</span>
        </div>
        <button
          type="button"
          tabIndex={show ? 0 : -1}
          disabled={soldOut}
          onClick={onBook}
          className={`shrink-0 min-h-12 inline-flex items-center justify-center gap-1.5 px-5 rounded-xl border-2 border-black text-black shadow-[3px_3px_0_#000] active:translate-y-0.5 active:shadow-[1px_1px_0_#000] transition-all touch-manipulation disabled:opacity-50 ${skin ? 'font-display text-xl tracking-[0.12em]' : 'font-comic text-lg tracking-wide bg-primary'}`}
          style={skin ? { background: skin.colors.button } : undefined}
        >
          {soldOut ? 'SOLD OUT' : <>BOOK PASS <ArrowRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>,
    document.body
  );
}

export default function EventShowcaseCard({ ev, index = 0, affiliateCode, onInquiry }) {
  const navigate = useNavigate();
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const detailsId = useId();
  // An event with its own look (eventSkins.js) keeps the same card, in its own colours and logo.
  const skin = skinFor(ev.eventId);
  const theme = skin ? { a: skin.colors.burst, b: skin.colors.orange, text: skin.colors.burst } : THEMES[index % THEMES.length];
  const dateRange = formatDateRange(ev.eventDays);
  const dayCount = ev.eventDays?.length || 0;
  const tiers = ev.ticketTiers || [];
  const salesOpen = ev.onlineSalesEnabled !== false;
  const refQuery = affiliateCode ? `&ref=${affiliateCode}` : '';
  const featuredTierIdx = tiers.findIndex((t) => t.tierId === 'vip');
  const countdown = useEventCountdown(ev.eventDays);
  const merch = ev.addOns || [];
  const soloTier = tiers.length === 1 ? tiers[0] : null;
  // Phones open the options panel only when it holds a choice (several tiers) or extras.
  const mobileOptions = tiers.length > 1 || merch.length > 0;

  // One place to book: the price stub (tablet and up) or the bottom bar (phones). With one ticket
  // type the price, total and stock are that type's own.
  const priceRupees = soloTier ? soloTier.pricePaise / 100 : Number(ev.basePriceRupees) || 0;
  const feeRupees = soloTier ? (soloTier.platformFeePaise ?? Math.round(Number(ev.platformFeeRupees) * 100)) / 100 : Number(ev.platformFeeRupees) || 0;
  const priceLabel = priceRupees % 1 ? priceRupees.toFixed(2) : String(priceRupees);
  const totalRupees = (priceRupees + feeRupees).toFixed(2);
  const stock = soloTier ? stockInfo(soloTier.capacity, soloTier.soldCount) : null;
  const soldOut = Boolean(stock?.soldOut);
  const availability = soloTier?.capacity > 0 ? (
    stock.soldOut ? { label: 'Sold out', tone: 'text-text-muted' }
      : stock.low ? { label: `Only ${stock.left} left`, tone: 'text-danger' }
        : { label: `${Number(soloTier.capacity).toLocaleString('en-IN')} passes available`, tone: 'text-success' }
  ) : null;
  const book = () => navigate(`/buy?eventId=${ev.eventId}${soloTier ? `&tier=${soloTier.tierId}` : ''}${refQuery}`);

  // The phone booking bar shows while this card fills the middle of the screen, but only when the
  // card's own Book button is off screen, so the two are never seen at once.
  const cardRef = useRef(null);
  const bookButtonRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [buttonVisible, setButtonVisible] = useState(false);
  useEffect(() => {
    const card = cardRef.current;
    const button = bookButtonRef.current;
    if (!card || typeof IntersectionObserver === 'undefined') return undefined;
    const cardObserver = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin: '-30% 0px -30% 0px' });
    cardObserver.observe(card);
    const buttonObserver = new IntersectionObserver(([entry]) => setButtonVisible(entry.isIntersecting));
    if (button) buttonObserver.observe(button);
    return () => { cardObserver.disconnect(); buttonObserver.disconnect(); };
  }, []);

  return (
    <article ref={cardRef} className="event-card relative group min-w-0">
      <MobileBookingBar
        show={inView && !buttonVisible}
        skin={skin}
        theme={theme}
        priceLabel={priceLabel}
        totalRupees={totalRupees}
        dateRange={dateRange}
        soldOut={soldOut}
        onBook={book}
      />
      {/* Ambient glow */}
      <div
        className="absolute -inset-2 rounded-[2rem] blur-2xl opacity-25 group-hover:opacity-40 transition-opacity duration-500"
        style={{ background: `linear-gradient(120deg, ${theme.a}, ${theme.b})` }}
      />

      {/* Gradient border */}
      <div
        className="relative rounded-[1.5rem] sm:rounded-[1.75rem] p-[2px] shadow-[4px_4px_0_#000] sm:shadow-[8px_8px_0_#000]"
        style={{ background: `linear-gradient(135deg, ${theme.a}, ${theme.b} 55%, ${theme.a})` }}
      >
        <div className="relative rounded-[calc(1.75rem-2px)] overflow-hidden" style={{ background: skin ? skin.colors.ink : '#0D0D1A' }}>
          {/* ===== Ticket body + stub ===== */}
          <div className="event-summary grid lg:grid-cols-[minmax(0,1fr)_300px]">
            {/* Event body */}
            <div className="relative min-w-0 p-4 sm:p-6 xl:p-8 overflow-hidden">
              {/* Themed art: gradient wash, halftone, giant watermark */}
              {skin ? <SkinBackdrop skin={skin} /> : <>
                <div
                  className="absolute inset-0 opacity-[0.18]"
                  style={{ background: `radial-gradient(circle at 15% 0%, ${theme.a}, transparent 55%), radial-gradient(circle at 100% 100%, ${theme.b}, transparent 50%)` }}
                />
                <div className="absolute inset-0 bg-halftone opacity-40" />
              </>}
              {!skin && <div
                className="absolute -right-4 -bottom-10 font-comic text-[11rem] sm:text-[14rem] leading-none select-none pointer-events-none opacity-[0.07]"
                style={{ color: theme.a }}
                aria-hidden="true"
              >
                {initials(ev.name)}
              </div>}

              <div className="relative space-y-3 sm:space-y-4">
                {/* Status + meta chips */}
                <div className="relative z-10 -mx-4 px-4 sm:mx-0 sm:px-0 flex flex-nowrap sm:flex-wrap overflow-x-auto sm:overflow-visible no-scrollbar items-center gap-1.5 sm:gap-2 font-mono text-[10px] sm:text-[11px] font-bold [&>span]:shrink-0 [&>span]:whitespace-nowrap">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border-2 border-black shadow-[2px_2px_0_#000] ${salesOpen ? 'bg-success text-white' : 'bg-warning text-black'}`}>
                    <span className="relative flex w-2 h-2">
                      {salesOpen && <span className="absolute inline-flex w-full h-full rounded-full bg-white opacity-75 animate-ping" />}
                      <span className="relative inline-flex w-2 h-2 rounded-full bg-white" />
                    </span>
                    {salesOpen ? 'LIVE • SELLING NOW' : 'ONLINE SALES PAUSED'}
                  </span>
                  {countdown && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border-2 border-black shadow-[2px_2px_0_#000] bg-accent text-white">
                      <Timer className="w-3.5 h-3.5 shrink-0" />
                      <span className="sm:hidden">{countdown.label.replace('Starts in ', 'In ')}</span>
                      <span className="hidden sm:inline">{countdown.label}</span>
                    </span>
                  )}
                  {dateRange && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-text">
                      <CalendarDays className="w-3.5 h-3.5" style={{ color: theme.b }} />
                      {dateRange}
                    </span>
                  )}
                  {ev.venue && (
                    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-text">
                      <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: theme.a }} />
                      <span className="min-w-0 break-words">{ev.venue}</span>
                    </span>
                  )}
                </div>

                {/* Title: the event's own logo when it has one */}
                {skin ? (
                  <div>
                    <h2 className="flex items-end gap-2 sm:gap-3">
                      <span className="sr-only">{ev.name}</span>
                      <span className="relative shrink-0 isolate">
                        {/* Sunlight behind the logo: slowly turning rays and a bright core */}
                        <span className="absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2 w-[260%] aspect-square pointer-events-none" aria-hidden="true">
                          <span
                            className="absolute inset-0 rounded-full motion-safe:animate-[spin_40s_linear_infinite]"
                            style={{
                              background: `repeating-conic-gradient(from 0deg, ${skin.colors.burst}38 0deg 4deg, transparent 4deg 12deg)`,
                              WebkitMaskImage: 'radial-gradient(circle, #000 8%, rgba(0,0,0,0.45) 28%, transparent 58%)',
                              maskImage: 'radial-gradient(circle, #000 8%, rgba(0,0,0,0.45) 28%, transparent 58%)'
                            }}
                          />
                          <span className="absolute inset-[32%] rounded-full blur-2xl opacity-55" style={{ background: `radial-gradient(circle, #FFF6C2 0%, ${skin.colors.burst} 35%, ${skin.colors.orange} 65%, transparent 75%)` }} />
                        </span>
                        <img src={skin.logo} alt="" width="441" height="176" className="relative h-24 sm:h-28 xl:h-32 w-auto drop-shadow-[0_4px_10px_rgba(0,0,0,0.55)]" />
                      </span>
                      {skin.edition && (
                        <span aria-hidden="true" className="font-display text-5xl sm:text-7xl leading-[0.8] pb-1" style={{ color: skin.colors.red, WebkitTextStroke: '1.5px #fff', textShadow: '4px 4px 0 #000' }}>{skin.edition}</span>
                      )}
                    </h2>
                    {skin.tagline && (
                      <p className="relative z-10 mt-3 font-display text-[15px] min-[400px]:text-lg sm:text-2xl tracking-[0.1em] sm:tracking-[0.18em] text-white leading-none whitespace-nowrap">{skin.tagline.join(' | ')}</p>
                    )}
                  </div>
                ) : (
                <h2
                  className="event-title font-comic tracking-wide leading-tight uppercase [overflow-wrap:anywhere]"
                  style={{ color: theme.text, textShadow: `3px 3px 0 #000, 6px 6px 0 ${theme.b}55` }}
                >
                  {ev.name}
                </h2>
                )}

                {/* Quick stats (controlled from Admin -> Settings -> Public Card Display) */}
                {(() => {
                  const cd = ev.cardDisplay || { showDays: true, showDailyCap: false, showTiers: false, customFields: [] };
                  const iconMap = { CalendarDays, Users, Ticket, Clock, MapPin, Zap, Flame, Crown, ShieldCheck };
                  const statItems = [
                    ...(cd.showDays !== false ? [{ icon: CalendarDays, value: dayCount || '—', label: dayCount === 1 ? 'Day' : 'Days' }] : []),
                    ...(cd.showDailyCap === true ? [{ icon: Users, value: ev.capacityLimit ? ev.capacityLimit.toLocaleString('en-IN') : '∞', label: 'Daily Cap' }] : []),
                    ...(cd.showTiers === true ? [{ icon: Ticket, value: tiers.length || 1, label: tiers.length === 1 ? 'Tier' : 'Tiers' }] : []),
                    ...((cd.customFields || []).map((f) => ({
                      icon: iconMap[f.icon] || CalendarDays,
                      value: f.value,
                      label: f.label
                    })))
                  ];
                  if (statItems.length === 0) return null;
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-lg pt-1">
                      {statItems.map(({ icon: Icon, value, label }, idx) => (
                        <div key={`${label}-${idx}`} className="min-w-0 rounded-xl bg-black/45 border border-white/15 px-2.5 sm:px-3 py-2 backdrop-blur-sm">
                          <div className="flex items-center gap-1 sm:gap-1.5 text-text-muted font-mono text-[9px] sm:text-[10px] uppercase truncate">
                            <Icon className="w-3 h-3 shrink-0" /> <span className="truncate">{label}</span>
                          </div>
                          <div className="font-comic text-lg sm:text-xl text-white leading-tight truncate">{value}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                <EventDescription text={ev.announcementText || 'Powered by FlashPass Next-Gen Ingress Engine with sub-500ms gate scanning, atomic anti-passback protection, and client-side pass delivery.'} accent={theme.a} band={skin?.colors.orange} />

                {/* One ticket type: what it includes sits here; it is booked from the price stub. */}
                {soloTier?.perks?.length > 0 && (
                  <div>
                    <span className="block mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">Your pass includes</span>
                    <ul className="flex flex-wrap gap-1.5 sm:gap-2">
                      {soloTier.perks.map((perk, i) => (
                        <li key={i} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/15 pl-1.5 pr-3 py-1 font-mono text-[11px] sm:text-xs text-white">
                          <span className="grid place-items-center w-5 h-5 rounded-full" style={{ background: `${skin ? theme.a : '#22D3EE'}26` }}>
                            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: skin ? theme.a : '#22D3EE' }} />
                          </span>
                          {perk}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Feature chips: a swipeable row on phones, wrapped on wider screens */}
                <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex flex-nowrap sm:flex-wrap overflow-x-auto sm:overflow-visible no-scrollbar snap-x gap-1.5 sm:gap-2 font-mono text-[10px] sm:text-xs">
                  {[
                    { icon: RefreshCw, label: ev.allowReentry !== false ? 'Re-Entry Allowed' : 'Single Entry', color: theme.a },
                    { icon: Smartphone, label: 'Offline PWA Pass', color: '#22D3EE' },
                    { icon: Clock, label: '30-Sec UPI Pay', color: '#FF2E88' },
                    { icon: Zap, label: '<500ms Gate Scan', color: '#FFD60A' }
                  ].map(({ icon: Icon, label, color }) => (
                    <span key={label} className="snap-start shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#161626]/90 border border-border text-text">
                      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                      <span className="min-w-0">{label}</span>
                    </span>
                  ))}
                </div>

              </div>

              {/* Phones: the Kolkata skyline as its own full-width strip under the details, edge to edge */}
              {skin && (
                <div className="md:hidden relative -mx-4 -mb-4 mt-5 aspect-[700/195] overflow-hidden" aria-hidden="true">
                  <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent, ${skin.colors.orange}33 60%, ${skin.colors.orange}55)` }} />
                  <KolkataSkyline orange={skin.colors.orange} red={skin.colors.red} viewBox="205 28 700 195" fit="xMidYMax meet" className="absolute inset-0 w-full h-full" />
                </div>
              )}
            </div>

            {/* The place to book: price, total, stock and the button. Phones: price beside the totals,
                full-width button below. Tablets: one row. Laptops: the ticket's torn-off stub. */}
            <div className={`event-booking relative min-w-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-4 md:flex md:flex-row md:items-center md:gap-6 lg:flex-col lg:justify-center lg:gap-0 lg:text-center border-t-2 lg:border-t-0 lg:border-l-2 border-dashed p-5 sm:p-6 lg:p-7 overflow-hidden ${skin ? 'border-white/30' : 'border-white/15 bg-[#121224]'}`} style={skin ? { background: '#111111' } : undefined}>
              {skin && <StubBackdrop skin={skin} />}
              {skin && <span className="kck-foil absolute inset-x-0 top-0 h-1 pointer-events-none" style={{ background: 'linear-gradient(90deg, #FF2E88, #FFD60A, #22D3EE, #FF2E88)', backgroundSize: '200% 100%' }} aria-hidden="true" />}

              {/* Ticket header: what this is and when (phones and laptops) */}
              <div className="relative col-span-2 flex md:hidden lg:flex w-full items-center justify-between gap-2 lg:mb-4 pb-3 border-b border-dashed border-white/15">
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: theme.a }}>
                  <Ticket className="w-3.5 h-3.5" /> Entry pass
                </span>
                {dateRange && <span className="font-mono text-[10px] font-bold text-white/80">{dateRange}</span>}
              </div>
              {/* Ticket notches (desktop) */}
              <span className="hidden lg:block absolute -left-[13px] -top-[13px] w-6 h-6 rounded-full bg-bg" aria-hidden="true" />
              <span className="hidden lg:block absolute -left-[13px] -bottom-[13px] w-6 h-6 rounded-full bg-bg" aria-hidden="true" />

              <div className="event-price min-w-0 shrink-0 flex flex-col items-center">
                <span className={`block font-mono text-[10px] lg:text-[11px] font-bold uppercase tracking-[0.15em] ${skin ? 'text-white/70' : 'text-text-muted'}`}>Passes from</span>
                {skin ? <PriceBurst color={skin.colors.burst} rupees={priceRupees} ribbon={dayCount > 1 ? `ALL ${dayCount} DAYS INCLUSIVE` : null} /> : (
                  <div className="font-comic text-5xl lg:text-6xl leading-none mt-1 lg:my-2" style={{ color: theme.a, textShadow: '3px 3px 0 #000' }}>₹{priceLabel}</div>
                )}
              </div>

              <div className="hidden md:flex lg:hidden min-w-0 flex-1 flex-col gap-1">
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-text-muted">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" /> Instant pass • No app needed
                </span>
              </div>

              <div className="col-span-2 w-full md:w-56 lg:w-full shrink-0 flex flex-col items-stretch lg:mt-5">
                <button
                  ref={bookButtonRef}
                  type="button"
                  disabled={soldOut}
                  onClick={book}
                  className={`event-book-button relative overflow-hidden ${skin ? 'kck-shine' : ''} min-h-12 w-full inline-flex items-center justify-center gap-1.5 px-5 py-3 border-2 border-black text-black shadow-[4px_4px_0_#000] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#000] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${skin ? 'rounded-2xl font-display text-2xl tracking-[0.12em] hover:brightness-105' : 'rounded-xl font-comic text-xl tracking-wide bg-primary hover:bg-primary-dark'}`}
                  style={skin ? { background: `linear-gradient(180deg, #FFD54A, ${skin.colors.button} 55%, #F2A900)` } : undefined}
                >
                  {soldOut ? <span>SOLD OUT</span> : <><span>BOOK PASS</span> <ArrowRight className="w-5 h-5 shrink-0" /></>}
                </button>
                <Link
                  to={`/cash?eventId=${ev.eventId}`}
                  className="mt-2.5 inline-flex items-center justify-center gap-1.5 text-xs font-mono text-text-muted hover:text-warning transition-colors"
                >
                  <Banknote className="w-3.5 h-3.5 shrink-0" /> Paying cash? Get venue token
                </Link>
                {/* What you get, at a glance */}
                <div className="relative mt-4 grid grid-cols-3 gap-1.5 md:hidden lg:grid">
                  {[[Zap, 'Instant QR'], [Smartphone, 'Works offline'], [ShieldCheck, 'Secure UPI']].map(([Icon, label]) => (
                    <span key={label} className="rounded-xl p-px" style={{ background: `linear-gradient(140deg, ${theme.a}88, transparent 45%, ${theme.b}88)` }}>
                      <span className="h-full flex flex-col items-center gap-1 rounded-[11px] bg-[#141414] px-1 py-2 font-mono text-[9px] font-bold uppercase tracking-wide text-white/80 text-center leading-tight">
                        <Icon className="w-4 h-4" style={{ color: theme.a }} /> {label}
                      </span>
                    </span>
                  ))}
                </div>
                {/* Ticket barcode */}
                <div className="relative mt-4 hidden lg:block" aria-hidden="true">
                  <div className="h-9 rounded-sm opacity-70" style={{ background: 'repeating-linear-gradient(90deg, #fff 0 2px, transparent 2px 4px, #fff 4px 5px, transparent 5px 8px, #fff 8px 11px, transparent 11px 13px)' }} />
                  <span className="mt-1 block truncate font-mono text-[9px] tracking-[0.25em] text-white/40">ADMIT ONE • {dayCount ? `${dayCount}-DAY PASS` : 'ENTRY PASS'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Keep mobile event browsing compact; full options stay visible on larger screens. */}
          {mobileOptions && (
            <button
              type="button"
              aria-expanded={detailsExpanded}
              aria-controls={detailsId}
              onClick={() => setDetailsExpanded(expanded => !expanded)}
              className="md:hidden w-full min-h-12 flex items-center justify-between gap-3 border-t-2 border-white/10 bg-white/[0.03] px-4 py-3 text-left hover:bg-white/[0.06] transition-colors"
            >
              <span className="min-w-0">
                <span className="block font-comic text-lg tracking-wide text-primary">{detailsExpanded ? 'Hide pass options' : 'View pass options'}</span>
                <span className="block font-mono text-[10px] text-text-muted">
                  {[
                    tiers.length > 1 && `${tiers.length} tiers`,
                    merch.length > 0 && `${merch.length} ${merch.length === 1 ? 'extra' : 'extras'}`
                  ].filter(Boolean).join(' · ')}
                </span>
              </span>
              <ChevronDown className={`w-5 h-5 shrink-0 text-primary transition-transform ${detailsExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}

          <div id={detailsId} className={`event-options ${detailsExpanded ? 'block' : 'hidden'} md:block`}>
          {/* ===== Pass tiers: only when there is a choice to make. One tier is booked from the stub. ===== */}
          {tiers.length > 1 && (
            <div className="border-t-2 border-white/10 p-4 sm:p-6 xl:p-8 bg-[#0B0B16]">
              <div className="flex flex-wrap items-end justify-between gap-2 mb-5">
                <div>
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-text-muted">Pick your experience</span>
                  <h3 className="font-comic text-2xl sm:text-3xl text-white uppercase tracking-wide">Choose your pass tier</h3>
                </div>
                <span className="text-[11px] font-mono text-text-muted">VIP perks, green rooms & stage access</span>
              </div>

              <div className="ticket-tier-grid grid gap-4">
                {tiers.map((tier, tIdx) => {
                  const tt = tier.tierId === 'vip' ? TIER_THEMES[1] : TIER_THEMES[tIdx % TIER_THEMES.length];
                  const featured = tIdx === (featuredTierIdx >= 0 ? featuredTierIdx : Math.min(1, tiers.length - 1)) && tiers.length > 1;
                  const fee = tier.platformFeePaise || 200;
                  const tierPriceRupees = (tier.pricePaise / 100).toFixed(2);
                  const tierFeeRupees = (fee / 100).toFixed(2);
                  const stock = stockInfo(tier.capacity, tier.soldCount);
                  return (
                    <div
                      key={tier.tierId}
                      className="relative min-w-0 flex flex-col rounded-2xl bg-[#14142A] border-2 overflow-hidden transition-all duration-300 hover:-translate-y-1.5"
                      style={{
                        borderColor: featured ? tt.accent : 'rgba(255,255,255,0.1)',
                        boxShadow: featured ? `0 0 30px ${tt.accent}33, 4px 4px 0 #000` : '4px 4px 0 #000'
                      }}
                    >
                      <div className="h-1.5" style={{ background: tt.accent }} />
                      {featured && (
                        <span className="self-end mt-2 mr-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[9px] font-bold bg-white text-black border-2 border-black">
                          <Crown className="w-3 h-3" /> MOST POPULAR
                        </span>
                      )}

                      <div className="p-4 sm:p-5 min-w-0 flex-1 flex flex-col">
                        <span
                          className={`self-start px-2 py-0.5 rounded-md font-mono text-[10px] font-bold border-2 border-black ${tt.label}`}
                          style={{ background: tt.accent }}
                        >
                          {tier.badge || 'PASS'}
                        </span>

                        <h4 className="font-comic text-2xl text-white mt-3 leading-tight">{tier.name}</h4>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="font-comic text-4xl" style={{ color: tt.accent }}>₹{tierPriceRupees}</span>
                        </div>
                        <span className="text-[10px] font-mono text-text-muted">+ ₹{tierFeeRupees} fee at checkout • {tier.capacity} passes</span>

                        {(stock.low || stock.soldOut) && (
                          <div className="mt-3 space-y-1.5">
                            <div className="flex items-center justify-between font-mono text-[10px] font-bold uppercase">
                              <span className={`inline-flex items-center gap-1 ${stock.soldOut ? 'text-text-muted' : 'text-danger'}`}>
                                <Flame className={`w-3.5 h-3.5 ${stock.soldOut ? '' : 'animate-pulse'}`} />
                                {stock.soldOut ? 'Sold out' : `Only ${stock.left} left!`}
                              </span>
                              <span className="text-text-muted">{stock.pctSold}% sold</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-warning to-danger" style={{ width: `${stock.pctSold}%` }} />
                            </div>
                          </div>
                        )}

                        <ul className="mt-4 space-y-2 text-xs font-mono flex-1">
                          {(tier.perks || []).map((perk, pIdx) => (
                            <li key={pIdx} className="flex items-start gap-2 text-text">
                              <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: tt.accent }} />
                              <span>{perk}</span>
                            </li>
                          ))}
                        </ul>

                        <button
                          type="button"
                          disabled={stock.soldOut}
                          onClick={() => navigate(`/buy?eventId=${ev.eventId}&tier=${tier.tierId}${refQuery}`)}
                          className={`mt-5 w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-comic text-lg tracking-wide border-2 border-black shadow-[3px_3px_0_#000] hover:-translate-y-0.5 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 ${tt.btn}`}
                        >
                          {stock.soldOut ? 'SOLD OUT' : <><span className="min-w-0">GET {(tier.badge || 'THIS').replace(/_/g, ' ')} PASS</span> <ArrowRight className="w-4 h-4 shrink-0" /></>}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ===== Official merch & extras (per event, managed in admin → Merch) ===== */}
          {merch.length > 0 && (
            <div className="border-t-2 border-white/10 p-4 sm:p-6 xl:p-8 bg-[#0D0D1A]">
              <div className="flex flex-wrap items-end justify-between gap-2 mb-5">
                <div>
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-info">Pre-order & skip the queue</span>
                  <h3 className="font-comic text-2xl sm:text-3xl text-white uppercase tracking-wide">Official merch & extras</h3>
                </div>
                <span className="text-[11px] font-mono text-text-muted">Pick up at the gate with your pass QR</span>
              </div>

              <div className="merch-grid grid gap-4 pb-1">
                {merch.map((item) => {
                  const Icon = ADDON_ICONS[item.category] || ShoppingBag;
                  const stock = stockInfo(item.inventory, item.soldCount);
                  return (
                    <div
                      key={item.addOnId}
                      className={`min-w-0 flex flex-col rounded-2xl bg-[#14142A] border-2 border-white/10 shadow-[4px_4px_0_#000] overflow-hidden transition-all ${stock.soldOut ? 'opacity-50' : 'hover:-translate-y-1 hover:border-info/60'}`}
                    >
                      <div className="relative h-24 flex items-center justify-center overflow-hidden" style={{ background: `linear-gradient(135deg, ${theme.a}33, ${theme.b}33)` }}>
                        <div className="absolute inset-0 bg-halftone opacity-40" />
                        <Icon className="relative w-12 h-12 text-white drop-shadow-[3px_3px_0_#000]" />
                        {(stock.low || stock.soldOut) && (
                          <span className={`absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border-2 border-black font-mono text-[9px] font-bold ${stock.soldOut ? 'bg-white/80 text-black' : 'bg-danger text-white'}`}>
                            <Flame className="w-3 h-3" /> {stock.soldOut ? 'SOLD OUT' : `ONLY ${stock.left} LEFT`}
                          </span>
                        )}
                      </div>
                      <div className="p-4 flex-1 flex flex-col">
                        <div className="text-sm font-semibold text-white leading-snug">{item.name}</div>
                        {item.description && <p className="mt-1 text-[11px] text-text-muted leading-snug line-clamp-2">{item.description}</p>}
                        {item.variants?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {item.variants.map((v) => (
                              <span key={v} className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 font-mono text-[9px] font-bold text-text">{v}</span>
                            ))}
                          </div>
                        )}
                        <div className="mt-auto pt-3 flex items-center justify-between gap-2">
                          <span className="font-comic text-2xl text-primary leading-none">₹{(item.pricePaise / 100).toFixed(0)}</span>
                          <button
                            type="button"
                            disabled={stock.soldOut}
                            onClick={() => navigate(`/buy?eventId=${ev.eventId}&addon=${encodeURIComponent(item.addOnId)}${refQuery}`)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-info text-black font-comic text-base tracking-wide border-2 border-black shadow-[2px_2px_0_#000] hover:-translate-y-0.5 transition-all cursor-pointer disabled:cursor-not-allowed disabled:hover:translate-y-0"
                          >
                            {stock.soldOut ? 'Sold out' : <>Pre-order <ArrowRight className="w-3.5 h-3.5" /></>}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          </div>

          {/* ===== Sponsor / stall strip ===== */}
          <div className={`border-t-2 px-4 sm:px-6 xl:px-8 py-4 flex flex-wrap items-center justify-between gap-3 ${skin ? 'border-black' : 'border-white/10 bg-gradient-to-r from-primary/10 via-transparent to-accent/10'}`} style={skin ? { background: skin.colors.orange } : undefined}>
            <div className="hidden md:flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary text-black flex items-center justify-center border-2 border-black shadow-[2px_2px_0_#000] shrink-0">
                <HeartHandshake className="w-5 h-5" />
              </div>
              <div>
                <div className={`uppercase leading-tight ${skin ? 'font-display text-2xl tracking-[0.08em] text-black' : 'font-comic text-lg text-white tracking-wide'}`}>
                  Sponsor this event or book a stall
                </div>
                <div className={`text-[11px] font-mono ${skin ? 'text-black/75' : 'text-text-muted'}`}>Prime brand presence & vendor spaces — talk to the organizers directly.</div>
              </div>
            </div>
            <div className="grid grid-cols-2 md:flex w-full md:w-auto items-center gap-2">
              <button
                type="button"
                onClick={() => onInquiry('SPONSOR', ev.eventId)}
                className="min-h-11 px-2 sm:px-3.5 py-2 rounded-xl bg-primary hover:bg-primary-dark text-black font-mono text-[10px] sm:text-xs font-bold border-2 border-black shadow-[2px_2px_0_#000] transition-all flex items-center justify-center gap-1.5 hover:-translate-y-0.5 cursor-pointer"
              >
                <Building2 className="w-4 h-4" /> SPONSOR
              </button>
              <button
                type="button"
                onClick={() => onInquiry('STALL', ev.eventId)}
                className={`min-h-11 px-2 sm:px-3.5 py-2 rounded-xl ${skin ? 'bg-black hover:bg-[#1a1a1a]' : 'bg-accent hover:bg-accent-hover'} text-white font-mono text-[10px] sm:text-xs font-bold border-2 border-black shadow-[2px_2px_0_#000] transition-all flex items-center justify-center gap-1.5 hover:-translate-y-0.5 cursor-pointer`}
              >
                <Store className="w-4 h-4" /> BOOK A STALL
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
