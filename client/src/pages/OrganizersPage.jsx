import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import Header from '../components/common/Header';
import SiteFooter from '../components/landing/SiteFooter';
import LeadModal from '../components/landing/LeadModal';
import { SectionHeader, PremiumPanel, IconTile } from '../components/landing/Premium';
import { playSuccessChime, playRejectionBuzzer, playExitChime } from '../utils/audioFeedback';
import {
  Zap, Ticket, ShieldCheck, QrCode, Smartphone, Users, ArrowRight, Sparkles, CheckCircle2, XCircle,
  Clock, Database, Lock, Layers, Volume2, Sliders, Cpu, RefreshCw, Printer, WifiOff, ShieldAlert,
  Radio, Send, Tag, Award, KeyRound, Timer, DoorOpen, Rocket, ClipboardList, Settings2, LineChart,
  Wallet, MessageSquare
} from 'lucide-react';

// Social-proof counters stay hidden until the platform has numbers worth showing
const MIN_PASSES_FOR_STATS = 100;

// The 8 FlashPass modules shown in the operating-suite grid
const SUITE_MODULES = [
  { icon: Ticket, a: '#FFD60A', b: '#FB923C', title: 'Online Purchase & Validity', text: '30-sec ultra-lean checkout with UPI intent on mobile and UPI QR on desktop. Server-authoritative day validity (3-Day, 2-Day, 1-Day Final Pass).' },
  { icon: Smartphone, a: '#FF2E88', b: '#FFD60A', title: 'Zero-Cost Digital Pass', text: 'No expensive SMS/WhatsApp gateway fees. Instant client-side PNG (1080×1920), printable vector A6 PDF, Web Share API, and offline PWA caching.' },
  { icon: RefreshCw, a: '#22D3EE', b: '#FF2E88', title: 'My Ticket Self-Recovery', text: 'Switched devices or cleared cache? Attendees retrieve active passes in seconds using Mobile + Order ID, protected by enumeration rate limits.' },
  { icon: Tag, a: '#F59E0B', b: '#FF2E88', title: 'Venue Cash Tokens', text: 'Attendees waiting in lines scan standee QRs to generate C-142 tokens with 30-min countdowns. Screen wake lock keeps the phone screen awake.' },
  { icon: Printer, a: '#FB923C', b: '#FFD60A', title: 'Box Office POS Counter', text: 'Cashiers operate without touching the mouse! Token lookup, automated change display, Spacebar confirm, 30s undo (Ctrl+Z), and shift close.' },
  { icon: QrCode, a: '#22D3EE', b: '#16A34A', title: 'Gate Volunteer Scanner', text: 'Runs in standard mobile browsers. Dual ENTRY/EXIT modes, <500ms feedback, emerald green success chime, and scarlet red double-entry buzzer.' },
  { icon: Radio, a: '#FF2E88', b: '#22D3EE', title: 'Super Admin Live Center', text: 'Real-time crowd meter, pass search drawer with full scan history, 1-click Force-Reset to OUTSIDE, staff PIN management, and CSV audit exports.' },
  { icon: Database, a: '#FFD60A', b: '#22D3EE', title: 'Virtual Financial Ledger', text: 'Dynamic pricing engine with 6-digit PIN verification. Integer paise precision, append-only records, and immutable order snapshots.' }
];

// Legacy-vs-FlashPass comparison rows
const COMPARISON = [
  { icon: Send, cap: 'Messaging & delivery fees', legacy: '₹1.50 – ₹3.00 per SMS or WhatsApp', flash: '₹0.00 — client-side vector PDF & PNG' },
  { icon: ShieldAlert, cap: 'Screenshot gate fraud', legacy: 'Rampant — friends share WhatsApp images', flash: '100% blocked via atomic anti-passback' },
  { icon: Clock, cap: 'Gate scan latency', legacy: '3,000 – 6,000 ms (creates long queues)', flash: '< 500 ms — continuous rear camera' },
  { icon: Printer, cap: 'Venue box office cash desk', legacy: 'Slow paper receipts (45s per guest)', flash: '10s self-service token + WebSocket sync' },
  { icon: Users, cap: 'Live inside-venue headcount', legacy: 'Rough estimates only', flash: 'Exact real-time count with safety alerts' },
  { icon: Sliders, cap: 'Pricing control', legacy: 'Rigid hardcoded pricing', flash: 'Live dynamic admin control + PIN security' }
];

// Onboarding steps for a new organizer
const HOW_IT_WORKS = [
  { icon: ClipboardList, a: '#FFD60A', b: '#FB923C', title: 'Share your event', text: 'Dates, venue, ticket tiers and daily capacity — one short form.' },
  { icon: Settings2, a: '#FF2E88', b: '#FFD60A', title: 'We set it up', text: 'Your event page, pass tiers, gates, staff logins and admin PIN go live.' },
  { icon: Ticket, a: '#22D3EE', b: '#FF2E88', title: 'Sell everywhere', text: 'Online UPI checkout, venue cash tokens and box-office POS — all on one ledger.' },
  { icon: LineChart, a: '#16A34A', b: '#22D3EE', title: 'Scan & track live', text: 'Volunteers scan on their phones while you watch crowd and revenue in real time.' }
];

export default function OrganizersPage() {
  const [leadOpen, setLeadOpen] = useState(false);
  const [stats, setStats] = useState(null);

  // Interactive Playground States
  const [simState, setSimState] = useState('OUTSIDE'); // 'OUTSIDE', 'INSIDE', 'REJECTED'
  const [simMessage, setSimMessage] = useState('Pass is outside the venue. Ready for first entry.');
  const [calcAttendees, setCalcAttendees] = useState(3000);
  const calcBasePrice = 50;
  const calcFee = 2;
  const [soundFeedbackText, setSoundFeedbackText] = useState('Click any sound button below to test');

  useEffect(() => {
    document.title = 'Host Your Event — FlashPass for Organizers';
    api.getPublicStats().then(setStats).catch(() => {});
    return () => { document.title = 'FlashPass — High-Speed Ingress & Ticketing'; };
  }, []);

  // Interactive Simulator Handlers
  const handleSimScanIn = () => {
    if (simState === 'INSIDE') {
      // Screenshot sharing attempt!
      setSimState('REJECTED');
      setSimMessage('ALREADY INSIDE ✕ Screenshot reuse blocked! Entered at Gate 1.');
      playRejectionBuzzer();
    } else {
      setSimState('INSIDE');
      setSimMessage('WELCOME! ✓ First entry today. State is now INSIDE.');
      playSuccessChime();
    }
  };

  const handleSimScanOut = () => {
    setSimState('OUTSIDE');
    setSimMessage('SEE YOU SOON ↗ Re-entry allowed. State reset to OUTSIDE.');
    playExitChime();
  };

  const handleSimReset = () => {
    setSimState('OUTSIDE');
    setSimMessage('Pass is outside the venue. Ready for first entry.');
  };

  // Calculator calculations
  const totalGross = calcAttendees * (calcBasePrice + calcFee);
  const totalOrganizer = calcAttendees * calcBasePrice;
  const totalPlatform = calcAttendees * calcFee;

  const showStats = stats && stats.passesIssued >= MIN_PASSES_FOR_STATS;
  const partnerPct = stats?.partnerCommissionPct ?? 10;

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col selection:bg-primary selection:text-black overflow-x-hidden">
      <Header />

      {/* 1. Organizer hero */}
      <section className="relative overflow-hidden pt-16 pb-16 px-4 border-b-2 border-border/60 bg-halftone">
        <div className="pointer-events-none absolute -top-32 -left-32 w-[520px] h-[480px] rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-20 w-[560px] h-[520px] rounded-full bg-accent/15 blur-3xl" />
        <div className="relative max-w-5xl mx-auto text-center space-y-6">
          <span className="inline-flex items-center gap-2 bg-surface-2 border-2 border-primary/60 px-4 py-1.5 rounded-full shadow-[2px_2px_0_#000] font-mono text-xs font-bold text-primary tracking-wider uppercase">
            <Rocket className="w-4 h-4" /> For event organizers
          </span>
          <h1 className="font-comic text-5xl sm:text-7xl text-white tracking-wide leading-[0.95] uppercase drop-shadow-[4px_4px_0_#000]">
            Run your whole event<br />
            on <span className="text-primary">one</span> <span className="text-accent">system</span>
          </h1>
          <p className="text-text-muted text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Online ticketing, venue cash counters, fraud-proof gate scanning and a live revenue dashboard — built for comic-cons, fests, expos and concerts.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setLeadOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-primary text-black font-comic text-2xl tracking-wide border-2 border-black shadow-[5px_5px_0_#000] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#000] transition-all animate-neon-glow cursor-pointer"
            >
              <Rocket className="w-6 h-6" /> Request a demo
            </button>
            <a
              href="#lab"
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white/5 text-white font-comic text-2xl tracking-wide border-2 border-white/20 shadow-[5px_5px_0_#000] hover:border-info hover:text-info hover:-translate-y-0.5 transition-all"
            >
              <Sparkles className="w-5 h-5" /> Try it live
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-2 font-mono text-[11px] text-text-muted">
            {['No app for attendees', 'Works on any phone', 'UPI + cash on one ledger'].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-success" /> {t}</span>
            ))}
          </div>

          {/* Real platform counters (only once they're meaningful) */}
          {showStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 max-w-4xl mx-auto">
              {[
                { label: 'Events hosted', value: stats.eventsHosted, c: '#FFD60A' },
                { label: 'Passes issued', value: stats.passesIssued, c: '#FF2E88' },
                { label: 'Gate entries scanned', value: stats.entriesScanned, c: '#22D3EE' },
                { label: 'Duplicate entries blocked', value: stats.fraudBlocked, c: '#16A34A' }
              ].map(({ label, value, c }) => (
                <div key={label} className="rounded-2xl bg-[#0D0D1A] border-2 border-white/10 p-4 shadow-[4px_4px_0_#000]">
                  <div className="font-comic text-4xl leading-none" style={{ color: c }}>{value.toLocaleString('en-IN')}</div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 2. How it works */}
      <section id="how-it-works" className="relative py-10 sm:py-16 px-4 border-b-2 border-border/60 overflow-hidden">
        <div className="relative max-w-6xl mx-auto">
          <SectionHeader
            icon={ClipboardList}
            eyebrow="How it works"
            title={<>Live in <span className="text-primary">4 steps</span></>}
            subtitle="From first message to gates opening — we handle the setup, you run the show."
          />
          <div className="grid grid-cols-2 lg:grid-cols-4 auto-rows-fr gap-3 sm:gap-5">
            {HOW_IT_WORKS.map((s, i) => (
              <PremiumPanel key={s.title} a={s.a} b={s.b} watermark={s.icon} glow={false} className="min-w-0" innerClassName="p-3 sm:p-5 flex flex-col gap-2 sm:gap-3">
                <div className="flex items-center justify-between">
                  <IconTile icon={s.icon} a={s.a} b={s.b} size="compact" />
                  <span className="font-comic text-3xl sm:text-4xl leading-none opacity-40" style={{ color: s.a }}>{i + 1}</span>
                </div>
                <h3 className="font-comic text-lg min-[380px]:text-xl sm:text-2xl text-white uppercase tracking-wide leading-tight">{s.title}</h3>
                <p className="text-xs sm:text-sm text-text-muted leading-relaxed">{s.text}</p>
              </PremiumPanel>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Pricing */}
      <section id="pricing" className="relative py-16 px-4 border-b-2 border-border/60 overflow-hidden">
        <div className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-5xl mx-auto">
          <SectionHeader
            icon={Wallet}
            eyebrow="Simple pricing"
            title={<>Pay only <span className="text-primary">when you sell</span></>}
            subtitle="A small fee per ticket, paid by the attendee — plus a share of sponsor & stall deals we bring you."
          />
          <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr] gap-6">
            <PremiumPanel a="#FFD60A" b="#FF2E88" watermark={Ticket} innerClassName="p-7 flex flex-col gap-5">
              <div className="flex items-center justify-between gap-3">
                <span className="px-2.5 py-1 rounded-full bg-primary text-black border-2 border-black font-mono text-[10px] font-bold uppercase shadow-[2px_2px_0_#000]">Standard</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">All 8 modules included</span>
              </div>
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="font-comic text-7xl text-primary leading-none drop-shadow-[3px_3px_0_#000]">₹2</span>
                  <span className="font-comic text-2xl text-white">/ ticket</span>
                </div>
                <p className="text-sm text-text-muted mt-1">Platform fee, shown to and paid by the attendee at checkout.</p>
              </div>
              <ul className="space-y-2.5">
                {[
                  'Your full ticket price goes to you (minus any ambassador commission you set)',
                  '₹0 SMS / WhatsApp delivery bills — passes are generated on the phone',
                  'Online UPI, venue cash tokens & box-office POS on one ledger',
                  'Gate scanning on any volunteer phone — no special hardware',
                  'Ambassador referral links with automatic commission tracking',
                  `${partnerPct}% commission only on sponsor & stall deals that come through FlashPass leads`
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm text-text">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-success" /> {t}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setLeadOpen(true)}
                className="mt-auto inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-black font-comic text-xl tracking-wide border-2 border-black shadow-[4px_4px_0_#000] hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                Get started <ArrowRight className="w-5 h-5" />
              </button>
            </PremiumPanel>

            <PremiumPanel a="#22D3EE" b="#FF2E88" watermark={Users} innerClassName="p-7 flex flex-col gap-5">
              <span className="self-start px-2.5 py-1 rounded-full bg-info text-black border-2 border-black font-mono text-[10px] font-bold uppercase shadow-[2px_2px_0_#000]">Large & multi-event</span>
              <div>
                <div className="font-comic text-5xl text-info leading-none drop-shadow-[3px_3px_0_#000]">Custom</div>
                <p className="text-sm text-text-muted mt-2">Running a big festival, a touring series or several events a year? Let's talk volume pricing.</p>
              </div>
              <ul className="space-y-2.5">
                {['Volume-based platform fee', 'Multiple events under one account', 'Multi-zone / hall access control'].map((t) => (
                  <li key={t} className="flex items-start gap-2.5 text-sm text-text">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-info" /> {t}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setLeadOpen(true)}
                className="mt-auto inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white/5 text-white font-comic text-xl tracking-wide border-2 border-white/20 shadow-[4px_4px_0_#000] hover:border-info hover:text-info hover:-translate-y-0.5 transition-all cursor-pointer"
              >
                <MessageSquare className="w-5 h-5" /> Talk to us
              </button>
            </PremiumPanel>
          </div>
        </div>
      </section>

      {/* 4. Interactive Live Playground (Experience the Software Right Here!) */}
      <section id="lab" className="scroll-mt-20 relative py-16 px-4 border-b-2 border-border/60 overflow-hidden">
        <div className="pointer-events-none absolute top-10 left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-full bg-info/10 blur-3xl" />
        <div className="relative max-w-6xl mx-auto">
          <SectionHeader
            icon={Sparkles}
            tone="accent"
            eyebrow="Live interactive lab"
            title={<>Test our engine <span className="text-primary">live</span> in your <span className="text-info">browser</span></>}
            subtitle="Play with the real gate audio synthesizer, anti-passback state machine and revenue split engine."
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Simulator A: Gate Audio Synthesizer */}
            <PremiumPanel a="#22D3EE" b="#16A34A" watermark={Volume2} innerClassName="p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <IconTile icon={Volume2} a="#22D3EE" b="#16A34A" size="sm" />
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-info">Lab 01</span>
                  <h3 className="font-comic text-2xl text-white uppercase tracking-wide leading-none">Gate Audio Synth</h3>
                </div>
              </div>
              <p className="text-sm text-text-muted leading-relaxed">
                Volunteers don't read screens in noisy halls — they listen. Try the Web Audio tones:
              </p>

              <div className="space-y-2.5">
                {[
                  { label: 'Valid Entry', hz: '880Hz chime', cls: 'bg-success text-white', play: () => { playSuccessChime(); setSoundFeedbackText('Played: 880Hz Pleasant Entry Chime'); } },
                  { label: 'Fraud Alert', hz: '220Hz sawtooth', cls: 'bg-danger text-white', play: () => { playRejectionBuzzer(); setSoundFeedbackText('Played: 220Hz Loud Fraud Alarm + 3x Vibration'); } },
                  { label: 'Scan Out', hz: 'Dual chime', cls: 'bg-exit text-white', play: () => { playExitChime(); setSoundFeedbackText('Played: Dual Soft Exit Chime'); } }
                ].map(({ label, hz, cls, play }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={play}
                    className={`w-full py-3 px-4 rounded-xl flex items-center justify-between border-2 border-black shadow-[3px_3px_0_#000] hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0.5 active:shadow-[1px_1px_0_#000] transition-all cursor-pointer ${cls}`}
                  >
                    <span className="font-comic text-lg tracking-wide">{label}</span>
                    <span className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase opacity-90">
                      {hz} <Volume2 className="w-4 h-4" />
                    </span>
                  </button>
                ))}
              </div>

              {/* Mini LCD with equalizer */}
              <div className="mt-auto rounded-xl bg-black/50 border border-white/10 p-3 flex items-center gap-3">
                <div key={soundFeedbackText} className="flex items-end gap-0.5 h-6">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className="lab-eq-bar w-1 rounded-sm bg-info" style={{ animationDelay: `${i * 70}ms` }} />
                  ))}
                </div>
                <span className="font-mono text-[11px] text-info leading-snug">{soundFeedbackText}</span>
              </div>
            </PremiumPanel>

            {/* Simulator B: Anti-Passback State Machine */}
            <PremiumPanel a="#FF2E88" b="#DC2626" watermark={ShieldCheck} innerClassName="p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <IconTile icon={ShieldCheck} a="#FF2E88" b="#DC2626" size="sm" />
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Lab 02</span>
                  <h3 className="font-comic text-2xl text-white uppercase tracking-wide leading-none">Anti-Passback</h3>
                </div>
              </div>
              <p className="text-sm text-text-muted leading-relaxed">
                Atomic conditional updates stop two people using the same pass. Scan in twice and see:
              </p>

              <div className={`relative rounded-2xl border-2 border-black shadow-[3px_3px_0_#000] p-5 text-center transition-all overflow-hidden ${
                simState === 'INSIDE'
                  ? 'bg-success text-white'
                  : simState === 'REJECTED'
                  ? 'bg-danger text-white animate-pulse'
                  : 'bg-[#14142A] text-text'
              }`}>
                <span className="font-mono text-[10px] uppercase font-bold tracking-[0.25em] opacity-75">Presence state</span>
                <div className="font-comic text-5xl tracking-wider leading-none my-2 drop-shadow-[3px_3px_0_#000]">{simState}</div>
                <p className="text-xs leading-snug opacity-90">{simMessage}</p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={handleSimScanIn}
                  className="py-2.5 rounded-xl bg-info text-black font-comic text-lg tracking-wide border-2 border-black shadow-[3px_3px_0_#000] hover:-translate-y-0.5 active:translate-y-0.5 transition-all cursor-pointer"
                >
                  Scan In
                </button>
                <button
                  type="button"
                  onClick={handleSimScanOut}
                  disabled={simState !== 'INSIDE'}
                  className="py-2.5 rounded-xl bg-exit text-white font-comic text-lg tracking-wide border-2 border-black shadow-[3px_3px_0_#000] hover:-translate-y-0.5 active:translate-y-0.5 transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  Scan Out
                </button>
              </div>

              <button
                type="button"
                onClick={handleSimReset}
                className="mt-auto inline-flex items-center justify-center gap-1.5 text-xs font-mono text-text-muted hover:text-white transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reset simulator
              </button>
            </PremiumPanel>

            {/* Simulator C: Dynamic Virtual Revenue Ledger */}
            <PremiumPanel a="#FFD60A" b="#FB923C" watermark={Sliders} innerClassName="p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <IconTile icon={Sliders} a="#FFD60A" b="#FB923C" size="sm" />
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Lab 03</span>
                  <h3 className="font-comic text-2xl text-white uppercase tracking-wide leading-none">Revenue Split</h3>
                </div>
              </div>
              <p className="text-sm text-text-muted leading-relaxed">
                Live settlement maths with automatic platform-fee splits and zero discrepancy:
              </p>

              <div className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted">Tickets sold</span>
                  <span className="font-comic text-3xl text-primary leading-none">{calcAttendees.toLocaleString('en-IN')}</span>
                </div>
                <input
                  type="range"
                  min="500"
                  max="10000"
                  step="500"
                  value={calcAttendees}
                  onChange={(e) => setCalcAttendees(Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                  aria-label="Tickets sold"
                />
              </div>

              <div className="rounded-2xl bg-black/40 border border-white/10 p-4 space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="font-mono text-[10px] uppercase text-text-muted">Gross collections</span>
                  <span className="font-comic text-2xl text-white">₹{totalGross.toLocaleString('en-IN')}</span>
                </div>
                {/* Split bar */}
                <div className="flex h-3 rounded-full overflow-hidden border border-black">
                  <div className="bg-success" style={{ width: `${(totalOrganizer / totalGross) * 100}%` }} />
                  <div className="bg-info flex-1" />
                </div>
                <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                  <div>
                    <div className="flex items-center gap-1 text-text-muted uppercase"><span className="w-2 h-2 rounded-full bg-success" /> Organizer (₹{calcBasePrice})</div>
                    <div className="font-comic text-xl text-success">₹{totalOrganizer.toLocaleString('en-IN')}</div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1 text-text-muted uppercase"><span className="w-2 h-2 rounded-full bg-info" /> Platform (₹{calcFee})</div>
                    <div className="font-comic text-xl text-info">₹{totalPlatform.toLocaleString('en-IN')}</div>
                  </div>
                </div>
              </div>

              <Link
                to="/admin"
                className="mt-auto inline-flex items-center justify-center gap-1.5 text-xs font-mono text-primary hover:text-white transition-colors"
              >
                Open admin financial center <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </PremiumPanel>
          </div>
        </div>
      </section>

      {/* 5. Complete 8-Module Feature Matrix (The Full OS) */}
      <section id="operating-suite" className="relative py-10 sm:py-16 px-4 border-b-2 border-border/60 overflow-hidden">
        <div className="pointer-events-none absolute -bottom-32 left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-6xl mx-auto">
          <SectionHeader
            icon={Layers}
            eyebrow="Full operational matrix"
            title={<>The complete <span className="text-primary">FlashPass</span> <span className="text-accent">operating suite</span></>}
            subtitle="Every layer — from attendee checkout to volunteer gate scanning and bank settlement — covered by dedicated, modular services."
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 auto-rows-fr gap-3 sm:gap-5">
            {SUITE_MODULES.map((m, i) => (
              <PremiumPanel key={m.title} a={m.a} b={m.b} watermark={m.icon} glow={false} className="min-w-0" innerClassName="p-3 sm:p-5 flex flex-col gap-2 sm:gap-3">
                <div className="flex items-center justify-between">
                  <IconTile icon={m.icon} a={m.a} b={m.b} size="compact" />
                  <span className="font-comic text-2xl sm:text-3xl leading-none opacity-30" style={{ color: m.a }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <div>
                  <span className="font-mono text-[9px] sm:text-[10px] font-bold uppercase tracking-wider sm:tracking-[0.2em]" style={{ color: m.a }}>Module M{i + 1}</span>
                  <h3 className="font-comic text-lg min-[380px]:text-xl text-white uppercase tracking-wide leading-tight">{m.title}</h3>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">{m.text}</p>
              </PremiumPanel>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Enterprise Cryptography & Hardware Resilience */}
      <section className="relative py-16 px-4 border-b-2 border-border/60 overflow-hidden">
        <div className="pointer-events-none absolute top-20 -left-40 w-[600px] h-[420px] rounded-full bg-info/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 -right-40 w-[600px] h-[420px] rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-6xl mx-auto">
          <SectionHeader
            icon={ShieldCheck}
            tone="info"
            eyebrow="Enterprise-grade security"
            title={<>Signed by <span className="text-info">crypto</span>, built for <span className="text-primary">chaos</span></>}
            subtitle="Tamper-proof passes with zero personal data — and a gate system that keeps working when the venue doesn't."
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cryptographic integrity */}
            <PremiumPanel a="#22D3EE" b="#16A34A" watermark={Lock} innerClassName="p-6 sm:p-7 flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <IconTile icon={Lock} a="#22D3EE" b="#16A34A" />
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-info">Cryptographic integrity</span>
                  <h3 className="font-comic text-2xl sm:text-3xl text-white uppercase tracking-wide leading-none">HMAC-SHA256 signed QR</h3>
                </div>
              </div>
              <p className="text-sm text-text-muted leading-relaxed">
                QR codes carry <span className="text-white font-semibold">zero attendee PII</span> — no phone, no name, no validity timestamps. Decode one and all you get is:
              </p>

              {/* Token anatomy */}
              <div className="rounded-2xl bg-black/50 border border-white/10 p-4">
                <div className="flex flex-wrap items-stretch gap-1.5 font-mono text-xs font-bold">
                  {[
                    { seg: 'CC1', label: 'key ver', c: '#FFD60A' },
                    { seg: '<passId>', label: 'pass', c: '#22D3EE' },
                    { seg: '<qrNonce>', label: 'nonce', c: '#FF2E88' },
                    { seg: '<22-char-hmac>', label: 'signature', c: '#16A34A' }
                  ].map(({ seg, label, c }, i) => (
                    <React.Fragment key={label}>
                      {i > 0 && <span className="self-start pt-1.5 text-text-muted">.</span>}
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className="px-2.5 py-1.5 rounded-lg border-2 border-black shadow-[2px_2px_0_#000]"
                          style={{ background: `${c}26`, color: c, borderColor: c }}
                        >
                          {seg}
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-text-muted">{label}</span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                {[
                  { icon: Timer, title: 'Constant-time verification', text: 'Memory-safe checks prevent timing attacks.' },
                  { icon: Zap, title: 'Zero DB query on fake QRs', text: 'Malformed tokens are rejected instantly in memory.' },
                  { icon: KeyRound, title: 'Key versioning (CC1, CC2)', text: 'Instant secret rotation without breaking active passes.' }
                ].map(({ icon: Icon, title, text }) => (
                  <div key={title} className="flex items-start gap-3 rounded-xl bg-white/[0.03] border border-white/10 p-3 hover:border-info/50 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-info/15 border border-info/40 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-info" />
                    </div>
                    <div>
                      <div className="font-comic text-lg text-white tracking-wide leading-tight">{title}</div>
                      <p className="text-xs text-text-muted leading-snug">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </PremiumPanel>

            {/* Hardware & network tolerance */}
            <PremiumPanel a="#FFD60A" b="#FB923C" watermark={WifiOff} innerClassName="p-6 sm:p-7 flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <IconTile icon={Cpu} a="#FFD60A" b="#FB923C" />
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Field resilience</span>
                  <h3 className="font-comic text-2xl sm:text-3xl text-white uppercase tracking-wide leading-none">Hardware & network tolerance</h3>
                </div>
              </div>
              <p className="text-sm text-text-muted leading-relaxed">
                Conventions and festivals suffer from cellular dead-zones. FlashPass is built to survive worst-case scenarios:
              </p>

              <div className="space-y-3">
                {[
                  { icon: WifiOff, a: '#22D3EE', b: '#16A34A', tag: 'Dead cell towers', fix: 'PWA caching', text: 'Passes are pre-cached in local storage and a Service Worker, so QR codes render instantly without internet.' },
                  { icon: Smartphone, a: '#FF2E88', b: '#FFD60A', tag: 'Cracked phone screens', fix: 'Order ID fallback', text: 'Too shattered for camera decode? Volunteers verify by Order ID in the built-in keypad modal in <3 seconds.' },
                  { icon: DoorOpen, a: '#FB923C', b: '#FF2E88', tag: 'Unscanned exits', fix: 'Admin force-reset', text: 'Left through a fire door? Help Desk verifies identity and force-resets presence to OUTSIDE with a logged justification.' }
                ].map(({ icon: Icon, a, b, tag, fix, text }, i) => (
                  <div key={tag} className="relative flex gap-3.5 rounded-2xl bg-white/[0.03] border border-white/10 p-4 hover:-translate-y-0.5 hover:border-white/25 transition-all">
                    <IconTile icon={Icon} a={a} b={b} size="sm" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: a }}>
                          Scenario {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/15 border border-success/40 text-success font-mono text-[9px] font-bold uppercase">
                          <CheckCircle2 className="w-3 h-3" /> {fix}
                        </span>
                      </div>
                      <div className="font-comic text-xl text-white tracking-wide leading-tight uppercase">{tag}</div>
                      <p className="text-xs text-text-muted leading-relaxed">{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </PremiumPanel>
          </div>
        </div>
      </section>

      {/* 7. Comparison: Legacy Platforms vs FlashPass */}
      <section id="platform-comparison" className="relative py-10 sm:py-16 px-4 border-b-2 border-border/60 overflow-hidden">
        <div className="pointer-events-none absolute top-24 left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-full bg-accent/10 blur-3xl" />
        <div className="relative max-w-5xl mx-auto">
          <SectionHeader
            icon={Award}
            tone="accent"
            eyebrow="Head-to-head"
            title={<><span className="text-text-muted">Legacy</span> <span className="text-accent">vs.</span> <span className="text-primary">FlashPass</span></>}
            subtitle="Why physical event organizers switch from legacy web portals to FlashPass."
          />

          <PremiumPanel a="#FFD60A" b="#FF2E88" watermark={Zap} innerClassName="p-2 sm:p-4">
            {/* Column headers (desktop) */}
            <div className="hidden md:grid grid-cols-[1.1fr_1fr_1.2fr] gap-3 px-3 pb-3 items-end">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">Key capability</span>
              <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2">
                <XCircle className="w-4 h-4 text-danger" />
                <div>
                  <div className="font-comic text-lg text-text-muted tracking-wide leading-none">Legacy platforms</div>
                  <div className="font-mono text-[9px] uppercase text-text-muted/70">BookMyShow / Events</div>
                </div>
              </div>
              <div className="relative flex items-center gap-2 rounded-xl bg-primary border-2 border-black shadow-[3px_3px_0_#000] px-3 py-2 text-black">
                <Zap className="w-4 h-4 fill-black" />
                <div>
                  <div className="font-comic text-lg tracking-wide leading-none">FlashPass engine</div>
                  <div className="font-mono text-[9px] uppercase font-bold opacity-70">Built for live venues</div>
                </div>
                <span className="absolute -top-2.5 -right-2 px-2 py-0.5 rounded-full bg-accent text-white border-2 border-black font-mono text-[9px] font-bold uppercase rotate-6">Winner</span>
              </div>
            </div>

            <div className="space-y-2.5">
              {COMPARISON.map(({ icon: Icon, cap, legacy, flash }) => (
                <div
                  key={cap}
                  className="comparison-row grid grid-cols-2 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-2 md:gap-3 items-stretch rounded-2xl bg-white/[0.03] border border-white/10 p-2 sm:p-2.5 hover:border-primary/50 hover:bg-white/[0.05] transition-colors"
                >
                  <div className="col-span-2 md:col-span-1 min-w-0 flex items-center gap-2 sm:gap-3 px-1">
                    <IconTile icon={Icon} a="#FFD60A" b="#FF2E88" size="compact" />
                    <span className="font-comic text-base min-[380px]:text-lg sm:text-xl text-white tracking-wide leading-tight uppercase">{cap}</span>
                  </div>
                  <div className="min-w-0 grid grid-cols-[auto_minmax(0,1fr)] content-start md:content-center items-center gap-x-1.5 gap-y-1.5 rounded-xl bg-danger/[0.07] border border-danger/20 px-2.5 md:px-3 py-2.5">
                    <XCircle className="w-3.5 h-3.5 md:w-4 md:h-4 text-danger shrink-0" />
                    <span className="md:hidden font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted">Legacy</span>
                    <span className="col-span-2 md:col-span-1 min-w-0 text-xs text-text-muted leading-relaxed md:leading-snug">{legacy}</span>
                  </div>
                  <div className="min-w-0 grid grid-cols-[auto_minmax(0,1fr)] content-start md:content-center items-center gap-x-1.5 gap-y-1.5 rounded-xl bg-success/10 border border-success/40 px-2.5 md:px-3 py-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-success shrink-0" />
                    <span className="md:hidden font-mono text-[10px] font-bold uppercase tracking-wider text-primary">FlashPass</span>
                    <span className="col-span-2 md:col-span-1 min-w-0 text-xs text-white font-semibold leading-relaxed md:leading-snug">{flash}</span>
                  </div>
                </div>
              ))}
            </div>
          </PremiumPanel>
        </div>
      </section>

      {/* Final organizer CTA */}
      <section className="relative py-16 px-4 overflow-hidden">
        <div className="relative max-w-5xl mx-auto">
          <PremiumPanel a="#FFD60A" b="#22D3EE" watermark={Rocket} innerClassName="p-8 sm:p-10 text-center flex flex-col items-center gap-4">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-info">Your next event</span>
            <h2 className="font-comic text-4xl sm:text-6xl text-white uppercase tracking-wide leading-none drop-shadow-[4px_4px_0_#000]">
              Ready for <span className="text-primary">zero queues</span>?
            </h2>
            <p className="text-sm text-text-muted max-w-xl">Tell us about your event — we'll reply on WhatsApp within 24 hours with a walkthrough.</p>
            <button
              type="button"
              onClick={() => setLeadOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl bg-primary text-black font-comic text-2xl tracking-wide border-2 border-black shadow-[5px_5px_0_#000] hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <Rocket className="w-6 h-6" /> Request a demo
            </button>
            <Link to="/" className="font-mono text-xs text-text-muted hover:text-white inline-flex items-center gap-1">
              See live events running on FlashPass <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </PremiumPanel>
        </div>
      </section>

      <SiteFooter />

      {leadOpen && <LeadModal type="ORGANIZER" onClose={() => setLeadOpen(false)} />}
    </div>
  );
}
