import React, { useEffect, useId, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  MapPin, CalendarDays, Users, Smartphone, Clock, CheckCircle2, RefreshCw,
  Building2, Store, HeartHandshake, ArrowRight, Crown, Ticket, Banknote, Zap, Flame, Timer,
  Shirt, Coffee, Car, ShoppingBag, ChevronDown
} from 'lucide-react';
import { stockInfo } from '../../utils/stock';

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

// With a single ticket type there is nothing to compare, so instead of one card stretched across
// the row the pass is shown as a full ticket: details on the left, a torn-off price stub on the right.
function SoloTierTicket({ tier, ev, theme, onBook }) {
  const accent = '#22D3EE';
  const price = tier.pricePaise / 100;
  const fee = (tier.platformFeePaise ?? 200) / 100;
  const stock = stockInfo(tier.capacity, tier.soldCount);
  const perks = tier.perks?.length ? tier.perks : ['Event admission'];
  const highlights = [
    { icon: Zap, label: 'Instant QR on your phone' },
    { icon: RefreshCw, label: ev.allowReentry !== false ? 'Re-entry allowed' : 'Single entry' },
    { icon: Smartphone, label: 'Works offline at the gate' }
  ];

  return (
    <div className="relative rounded-3xl p-[2px] shadow-[6px_6px_0_#000]" style={{ background: `linear-gradient(120deg, ${accent}, ${theme.b} 60%, ${theme.a})` }}>
      <div className="relative grid md:grid-cols-[minmax(0,1fr)_280px] rounded-[calc(1.5rem-2px)] bg-[#11112A] overflow-hidden">
        {/* Ticket body */}
        <div className="relative min-w-0 p-5 sm:p-7 overflow-hidden">
          <div className="absolute inset-0 opacity-[0.16] pointer-events-none" style={{ background: `radial-gradient(circle at 0% 0%, ${accent}, transparent 50%), radial-gradient(circle at 90% 120%, ${theme.b}, transparent 55%)` }} />
          <div className="absolute inset-0 bg-halftone opacity-30 pointer-events-none" />
          <Ticket className="absolute -right-6 -bottom-8 w-48 h-48 rotate-[-18deg] pointer-events-none" style={{ color: accent, opacity: 0.06 }} aria-hidden="true" />

          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold border-2 border-black text-black" style={{ background: accent }}>
                {tier.badge || 'PASS'}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-white/5 border border-white/10 text-text">
                <CheckCircle2 className="w-3 h-3 text-success" /> Everything included
              </span>
            </div>

            <h4 className="mt-3 font-comic text-3xl sm:text-4xl text-white leading-tight uppercase [overflow-wrap:anywhere]" style={{ textShadow: `3px 3px 0 #000` }}>
              {tier.name}
            </h4>

            {/* What the pass gets you */}
            <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {perks.map((perk, i) => (
                <li key={i} className="flex items-center gap-2.5 rounded-xl bg-black/30 border border-white/10 px-3 py-2.5 font-mono text-xs text-text">
                  <span className="grid place-items-center w-6 h-6 rounded-lg shrink-0 border border-black" style={{ background: `${accent}26` }}>
                    <CheckCircle2 className="w-3.5 h-3.5" style={{ color: accent }} />
                  </span>
                  <span className="min-w-0">{perk}</span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] text-text-muted">
              {highlights.map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" style={{ color: theme.a }} /> {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Price stub, torn off along the dashed line */}
        <div className="relative min-w-0 flex flex-col justify-center gap-3 p-5 sm:p-6 bg-[#0B0B1C] border-t-2 md:border-t-0 md:border-l-2 border-dashed border-white/15 text-center">
          <span className="hidden md:block absolute -left-[13px] -top-[13px] w-6 h-6 rounded-full bg-[#0B0B16]" aria-hidden="true" />
          <span className="hidden md:block absolute -left-[13px] -bottom-[13px] w-6 h-6 rounded-full bg-[#0B0B16]" aria-hidden="true" />

          <div>
            <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">Per person</span>
            <div className="font-comic text-5xl sm:text-6xl leading-none mt-1" style={{ color: accent, textShadow: '3px 3px 0 #000' }}>
              ₹{price.toFixed(price % 1 ? 2 : 0)}
            </div>
            <span className="block mt-1.5 font-mono text-[10px] text-text-muted">+ ₹{fee.toFixed(2)} fee • ₹{(price + fee).toFixed(2)} at checkout</span>
          </div>

          {tier.capacity > 0 && (
            <div className="space-y-1.5 text-left">
              <div className="flex justify-between font-mono text-[10px] font-bold uppercase">
                <span className={stock.soldOut ? 'text-text-muted' : stock.low ? 'text-danger' : 'text-success'}>
                  {stock.soldOut ? 'Sold out' : stock.low ? `Only ${stock.left} left` : 'Available'}
                </span>
                <span className="text-text-muted">{Number(tier.capacity).toLocaleString('en-IN')} passes</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.max(stock.pctSold, 3)}%`, background: stock.low ? 'linear-gradient(90deg,#FB923C,#EF4444)' : `linear-gradient(90deg, ${accent}, ${theme.b})` }} />
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={stock.soldOut}
            onClick={onBook}
            className="w-full min-h-12 inline-flex items-center justify-center gap-1.5 rounded-xl font-comic text-xl tracking-wide border-2 border-black text-black shadow-[4px_4px_0_#000] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#000] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            style={{ background: accent }}
          >
            {stock.soldOut ? 'SOLD OUT' : <>GET YOUR PASS <ArrowRight className="w-5 h-5 shrink-0" /></>}
          </button>
          <span className="inline-flex items-center justify-center gap-1.5 font-mono text-[10px] text-text-muted">
            <Clock className="w-3.5 h-3.5" /> 30-second UPI checkout
          </span>
        </div>
      </div>
    </div>
  );
}

export default function EventShowcaseCard({ ev, index = 0, affiliateCode, onInquiry }) {
  const navigate = useNavigate();
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const detailsId = useId();
  const theme = THEMES[index % THEMES.length];
  const dateRange = formatDateRange(ev.eventDays);
  const dayCount = ev.eventDays?.length || 0;
  const tiers = ev.ticketTiers || [];
  const salesOpen = ev.onlineSalesEnabled !== false;
  const refQuery = affiliateCode ? `&ref=${affiliateCode}` : '';
  const featuredTierIdx = tiers.findIndex((t) => t.tierId === 'vip');
  const countdown = useEventCountdown(ev.eventDays);
  const merch = ev.addOns || [];

  return (
    <article className="event-card relative group min-w-0">
      {/* Ambient glow */}
      <div
        className="absolute -inset-2 rounded-[2rem] blur-2xl opacity-25 group-hover:opacity-40 transition-opacity duration-500"
        style={{ background: `linear-gradient(120deg, ${theme.a}, ${theme.b})` }}
      />

      {/* Gradient border */}
      <div
        className="relative rounded-[1.75rem] p-[2px] shadow-[8px_8px_0_#000]"
        style={{ background: `linear-gradient(135deg, ${theme.a}, ${theme.b} 55%, ${theme.a})` }}
      >
        <div className="relative rounded-[calc(1.75rem-2px)] bg-[#0D0D1A] overflow-hidden">
          {/* ===== Ticket body + stub ===== */}
          <div className="event-summary grid lg:grid-cols-[minmax(0,1fr)_300px]">
            {/* Event body */}
            <div className="relative min-w-0 p-4 sm:p-6 xl:p-8 overflow-hidden">
              {/* Themed art: gradient wash, halftone, giant watermark */}
              <div
                className="absolute inset-0 opacity-[0.18]"
                style={{ background: `radial-gradient(circle at 15% 0%, ${theme.a}, transparent 55%), radial-gradient(circle at 100% 100%, ${theme.b}, transparent 50%)` }}
              />
              <div className="absolute inset-0 bg-halftone opacity-40" />
              <div
                className="absolute -right-4 -bottom-10 font-comic text-[11rem] sm:text-[14rem] leading-none select-none pointer-events-none opacity-[0.07]"
                style={{ color: theme.a }}
                aria-hidden="true"
              >
                {initials(ev.name)}
              </div>

              <div className="relative space-y-3 sm:space-y-4">
                {/* Status + meta chips */}
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 font-mono text-[10px] sm:text-[11px] font-bold">
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
                  {ev.venue && (
                    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-text">
                      <MapPin className="w-3.5 h-3.5 shrink-0" style={{ color: theme.a }} />
                      <span className="min-w-0 break-words">{ev.venue}</span>
                    </span>
                  )}
                  {dateRange && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-text">
                      <CalendarDays className="w-3.5 h-3.5" style={{ color: theme.b }} />
                      {dateRange}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h2
                  className="event-title font-comic tracking-wide leading-tight uppercase [overflow-wrap:anywhere]"
                  style={{ color: theme.text, textShadow: `3px 3px 0 #000, 6px 6px 0 ${theme.b}55` }}
                >
                  {ev.name}
                </h2>

                <p className="text-xs sm:text-sm text-text-muted leading-relaxed max-w-2xl">
                  {ev.announcementText || 'Powered by FlashPass Next-Gen Ingress Engine with sub-500ms gate scanning, atomic anti-passback protection, and client-side pass delivery.'}
                </p>

                {/* Feature chips */}
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 sm:gap-2 font-mono text-[10px] sm:text-xs">
                  {[
                    { icon: RefreshCw, label: ev.allowReentry !== false ? 'Re-Entry Allowed' : 'Single Entry', color: theme.a },
                    { icon: Smartphone, label: 'Offline PWA Pass', color: '#22D3EE' },
                    { icon: Clock, label: '30-Sec UPI Pay', color: '#FF2E88' },
                    { icon: Zap, label: '<500ms Gate Scan', color: '#FFD60A' }
                  ].map(({ icon: Icon, label, color }) => (
                    <span key={label} className="min-w-0 inline-flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-xl bg-[#161626]/90 border border-border text-text">
                      <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                      <span className="min-w-0">{label}</span>
                    </span>
                  ))}
                </div>

                {/* Quick stats */}
                <div className="grid grid-cols-3 gap-2 max-w-md pt-1">
                  {[
                    { icon: CalendarDays, value: dayCount || '—', label: dayCount === 1 ? 'Day' : 'Days' },
                    { icon: Users, value: ev.capacityLimit ? ev.capacityLimit.toLocaleString('en-IN') : '∞', label: 'Daily Cap' },
                    { icon: Ticket, value: tiers.length || 1, label: tiers.length === 1 ? 'Tier' : 'Tiers' }
                  ].map(({ icon: Icon, value, label }) => (
                    <div key={label} className="min-w-0 rounded-xl bg-black/30 border border-white/10 px-2 sm:px-3 py-2">
                      <div className="flex items-center gap-1 sm:gap-1.5 text-text-muted font-mono text-[9px] sm:text-[10px] uppercase">
                        <Icon className="w-3 h-3" /> {label}
                      </div>
                      <div className="font-comic text-xl sm:text-2xl text-white leading-tight">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Price stub with perforation */}
            <div className="event-booking relative min-w-0 border-t-2 lg:border-t-0 lg:border-l-2 border-dashed border-white/15 bg-[#121224] p-4 sm:p-6 lg:p-7 grid grid-cols-[minmax(0,1fr)_minmax(7.25rem,0.85fr)] items-center gap-x-3 gap-y-2 lg:flex lg:flex-col lg:justify-center lg:gap-0 lg:text-center">
              {/* Ticket notches (desktop) */}
              <span className="hidden lg:block absolute -left-[13px] -top-[13px] w-6 h-6 rounded-full bg-bg" aria-hidden="true" />
              <span className="hidden lg:block absolute -left-[13px] -bottom-[13px] w-6 h-6 rounded-full bg-bg" aria-hidden="true" />

              <div className="event-price min-w-0">
                <span className="block font-mono text-[10px] lg:text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted">Passes from</span>
                <div className="font-comic text-4xl lg:text-6xl leading-none mt-1 lg:my-2 [overflow-wrap:anywhere]" style={{ color: theme.a, textShadow: '3px 3px 0 #000' }}>
                  ₹{ev.basePriceRupees}
                </div>
              </div>
              <span className="col-span-2 font-mono text-[10px] text-text-muted">
                + ₹{ev.platformFeeRupees} platform fee at checkout
              </span>

              <button
                type="button"
                onClick={() => navigate(`/buy?eventId=${ev.eventId}${refQuery}`)}
                className="event-book-button col-start-2 row-start-1 lg:mt-5 min-h-12 min-w-0 w-full inline-flex items-center justify-center gap-1.5 font-comic text-lg sm:text-xl tracking-wide px-2 sm:px-5 py-3 rounded-xl border-2 border-black bg-primary text-black shadow-[4px_4px_0_#000] hover:bg-primary-dark hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#000] transition-all cursor-pointer"
              >
                <span>BOOK PASS</span> <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              </button>

              <Link
                to={`/cash?eventId=${ev.eventId}`}
                className="col-span-2 min-h-9 lg:min-h-0 lg:mt-3 inline-flex items-center justify-center gap-1.5 text-[11px] sm:text-xs font-mono text-text-muted hover:text-warning transition-colors"
              >
                <Banknote className="w-3.5 h-3.5 shrink-0" /> Paying cash? Get venue token
              </Link>

              <div className="col-span-2 pt-2 lg:mt-5 lg:pt-4 border-t border-white/10 flex items-center justify-center gap-1.5 font-mono text-[10px] text-text-muted">
                <CheckCircle2 className="w-3.5 h-3.5 text-success" /> Instant pass • No app needed
              </div>
            </div>
          </div>

          {/* Keep mobile event browsing compact; full options stay visible on larger screens. */}
          {(tiers.length > 0 || merch.length > 0) && (
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
                    tiers.length > 0 && `${tiers.length} ${tiers.length === 1 ? 'tier' : 'tiers'}`,
                    merch.length > 0 && `${merch.length} ${merch.length === 1 ? 'extra' : 'extras'}`
                  ].filter(Boolean).join(' · ')}
                </span>
              </span>
              <ChevronDown className={`w-5 h-5 shrink-0 text-primary transition-transform ${detailsExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}

          <div id={detailsId} className={`event-options ${detailsExpanded ? 'block' : 'hidden'} md:block`}>
          {/* ===== Pass tiers ===== */}
          {tiers.length > 0 && (
            <div className="border-t-2 border-white/10 p-4 sm:p-6 xl:p-8 bg-[#0B0B16]">
              <div className="flex flex-wrap items-end justify-between gap-2 mb-5">
                <div>
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-text-muted">{tiers.length === 1 ? 'Your ticket' : 'Pick your experience'}</span>
                  <h3 className="font-comic text-2xl sm:text-3xl text-white uppercase tracking-wide">{tiers.length === 1 ? 'One pass, all in' : 'Choose your pass tier'}</h3>
                </div>
                <span className="text-[11px] font-mono text-text-muted">{tiers.length === 1 ? 'Instant QR • works offline at the gate' : 'VIP perks, green rooms & stage access'}</span>
              </div>

              {tiers.length === 1 ? (
                <SoloTierTicket tier={tiers[0]} ev={ev} theme={theme} onBook={() => navigate(`/buy?eventId=${ev.eventId}&tier=${tiers[0].tierId}${refQuery}`)} />
              ) : (
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
              )}
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
          <div className="border-t-2 border-white/10 px-4 sm:px-6 xl:px-8 py-4 bg-gradient-to-r from-primary/10 via-transparent to-accent/10 flex flex-wrap items-center justify-between gap-3">
            <div className="hidden md:flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary text-black flex items-center justify-center border-2 border-black shadow-[2px_2px_0_#000] shrink-0">
                <HeartHandshake className="w-5 h-5" />
              </div>
              <div>
                <div className="font-comic text-lg text-white uppercase tracking-wide leading-tight">
                  Sponsor this event or book a stall
                </div>
                <div className="text-[11px] font-mono text-text-muted">Prime brand presence & vendor spaces — talk to the organizers directly.</div>
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
                className="min-h-11 px-2 sm:px-3.5 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white font-mono text-[10px] sm:text-xs font-bold border-2 border-black shadow-[2px_2px_0_#000] transition-all flex items-center justify-center gap-1.5 hover:-translate-y-0.5 cursor-pointer"
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
