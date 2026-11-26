import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../services/api';
import {
  Zap, Ticket, Shield, Flame, Sparkles, ChevronDown, Menu, X,
  QrCode, DollarSign, Smartphone, ShieldCheck, ArrowRight, Activity, ArrowLeft, Rocket
} from 'lucide-react';
import ComicButton from './ComicButton';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [modulesDropdownOpen, setModulesDropdownOpen] = useState(false);
  const [eventDropdownOpen, setEventDropdownOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const eventDropdownRef = useRef(null);

  useEffect(() => {
    setMobileMenuOpen(false);
    setModulesDropdownOpen(false);
    setEventDropdownOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  useEffect(() => {
    api.getAllPublicEvents()
      .then(res => {
        if (Array.isArray(res) && res.length > 0) {
          setEvents(res);
        }
      })
      .catch(() => {});
  }, []);

  const searchParams = new URLSearchParams(location.search);
  const currentEventId = searchParams.get('eventId');
  // Until the events load (or with none on sale) the header shows a neutral placeholder;
  // its links open checkout, which picks the event on sale.
  const activeEvent = (events.find(e => e.eventId === currentEventId)) || events[0] || {
    eventId: '',
    name: 'FlashPass',
    venue: '',
    basePriceRupees: '50.00'
  };

  useEffect(() => {
    const handleOutside = (e) => {
      if (eventDropdownRef.current && !eventDropdownRef.current.contains(e.target)) {
        setEventDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <header className="site-header sticky top-0 z-50 bg-[#0B0B14]/90 backdrop-blur-xl border-b-2 border-border/80 transition-all select-none">
      {/* Top 2px Neon Gradient Stripe */}
      <div className="h-[2.5px] w-full bg-gradient-to-r from-primary via-accent to-info"></div>

      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 sm:gap-3">
        {/* Left: Brand Identity with Glowing Comic Energy */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="hidden sm:flex shrink-0 min-h-11 px-3 rounded-xl bg-surface-2 hover:bg-surface border border-border hover:border-primary text-text-muted hover:text-primary transition-all items-center gap-1.5 font-mono text-xs font-bold shadow-[2px_2px_0_#000]"
            title="Go to previous page"
          >
            <ArrowLeft className="w-4 h-4 text-primary" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <Link to="/" className="flex min-w-0 items-center gap-2 sm:gap-3 group" aria-label="FlashPass home">
            {/* Animated Logo Icon Box */}
            <div className="relative shrink-0">
              <div className="absolute -inset-1 bg-gradient-to-r from-primary to-accent rounded-xl blur-sm opacity-70 group-hover:opacity-100 transition-opacity"></div>
              <div className="relative w-9 h-9 sm:w-11 sm:h-11 bg-primary border-2 border-black rounded-xl flex items-center justify-center shadow-[3px_3px_0_#000] group-hover:rotate-6 group-hover:scale-105 transition-all">
                <Zap className="w-6 h-6 text-black fill-black" />
              </div>
            </div>

            {/* Brand Title & Engine Status */}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-comic text-xl sm:text-3xl text-primary tracking-wide sm:tracking-wider leading-none drop-shadow-[2px_2px_0_#000]">
                  FLASHPASS
                </span>
                <span className="hidden xs:inline-flex items-center gap-1 bg-surface-2 text-text font-mono text-[9px] font-bold px-2 py-0.5 rounded-full border border-border">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-ping"></span>
                  <span>ENGINE v2.0</span>
                </span>
              </div>
              <span className="hidden sm:block text-[10px] text-text-muted font-mono tracking-widest uppercase">
                High-Speed Ingress & Ticketing
              </span>
            </div>
          </Link>
        </div>

        {/* Center: Live Event Beacon Pill & Interactive Dropdown */}
        <div className="relative hidden min-[1800px]:flex items-center min-w-0" ref={eventDropdownRef}>
          <button
            type="button"
            onClick={() => {
              if (events.length > 1) {
                setEventDropdownOpen(!eventDropdownOpen);
              } else {
                navigate(`/buy?eventId=${activeEvent.eventId}`);
              }
            }}
            className={`group flex items-center gap-2.5 h-10 px-3.5 rounded-full border-2 transition-all duration-200 select-none cursor-pointer shadow-[2px_2px_0_#000] whitespace-nowrap ${
              eventDropdownOpen
                ? 'bg-surface-2 border-primary ring-2 ring-primary/20 shadow-[3px_3px_0_#FFD60A]'
                : 'bg-[#12121E] hover:bg-[#181828] border-border hover:border-primary/60'
            }`}
            title="Click to view/switch live events"
          >
            {/* Animated Live Radar Beacon */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_#10B981]"></span>
              </span>
              <span className="text-[10px] font-mono font-black uppercase text-emerald-400 tracking-wider">
                LIVE
              </span>
            </div>

            <div className="h-3.5 w-px bg-border/80 flex-shrink-0"></div>

            {/* Event Name - Strict Single Line with Smart Truncation */}
            <span className="font-comic text-sm tracking-wide text-text group-hover:text-primary transition-colors max-w-[150px] truncate whitespace-nowrap leading-none">
              {activeEvent.name}
            </span>

            {/* Starting Price Pill */}
            <span className="flex-shrink-0 font-mono text-[11px] font-bold text-primary bg-black/60 px-2 py-0.5 rounded-md border border-primary/30">
              ₹{parseFloat(activeEvent.totalPriceRupees || activeEvent.basePriceRupees || 50).toFixed(0)}
            </span>

            {/* Multi-Event Switcher Pill Indicator */}
            {events.length > 1 && (
              <span className="flex-shrink-0 inline-flex items-center gap-1 pl-1.5 pr-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 text-[10px] font-mono font-bold group-hover:bg-primary group-hover:text-black transition-all">
                <span className="w-1.5 h-1.5 rounded-full bg-primary group-hover:bg-black"></span>
                <span className="whitespace-nowrap">{events.length} Events</span>
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${eventDropdownOpen ? 'rotate-180' : ''}`} />
              </span>
            )}
          </button>

          {/* Dropdown Menu for Multiple Running Events */}
          {eventDropdownOpen && events.length > 1 && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2.5 w-84 bg-[#10101C]/95 backdrop-blur-2xl border-2 border-border rounded-2xl p-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.8),_4px_4px_0_#FFD60A] space-y-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-2.5 py-1.5 text-[10px] font-mono font-bold text-text-muted uppercase border-b border-border/60 flex justify-between items-center">
                <span className="flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-accent" />
                  <span>ACTIVE CLIENT EVENTS ({events.length})</span>
                </span>
                <span className="text-emerald-400 text-[10px] flex items-center gap-1 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> Live Now
                </span>
              </div>

              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {events.map((ev) => {
                  const isCurrent = ev.eventId === activeEvent.eventId;
                  return (
                    <div
                      key={ev.eventId}
                      onClick={() => {
                        setEventDropdownOpen(false);
                        navigate(`/buy?eventId=${ev.eventId}`);
                      }}
                      className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-primary/15 border-primary shadow-[2px_2px_0_#FFD60A]'
                          : 'bg-surface-2/80 border-border hover:border-primary/50 hover:bg-surface'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Ticket className={`w-3.5 h-3.5 flex-shrink-0 ${isCurrent ? 'text-primary' : 'text-text-muted'}`} />
                          <span className="font-comic text-sm text-text font-bold truncate block">
                            {ev.name}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-text-muted truncate block mt-0.5">
                          📍 {ev.venue || 'Convention Venue'}
                        </span>
                      </div>

                      <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                        <span className="font-comic text-xs text-primary font-bold">
                          ₹{ev.totalPriceRupees || ev.basePriceRupees || '50'}
                        </span>
                        <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                          isCurrent
                            ? 'bg-primary text-black border-primary'
                            : 'bg-surface text-accent border-accent/40 hover:bg-accent hover:text-white'
                        }`}>
                          {isCurrent ? 'SELECTED' : 'SWITCH →'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-1.5 border-t border-border/60">
                <Link
                  to="/#live-events"
                  onClick={() => {
                    setEventDropdownOpen(false);
                    const el = document.getElementById('live-events');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="block text-center text-[10px] font-mono text-text-muted hover:text-primary transition-colors py-1 font-bold"
                >
                  Explore All Events on Landing Page ↓
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Center / Right: Navigation & Actions */}
        <div className="hidden xl:flex items-center gap-3 flex-shrink-0">
          {/* Modules Interactive Dropdown */}
          <div className="relative">
            <button
              onClick={() => setModulesDropdownOpen(!modulesDropdownOpen)}
              onBlur={() => setTimeout(() => setModulesDropdownOpen(false), 200)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-bold text-text-muted hover:text-text hover:bg-surface-2 transition-all border border-transparent hover:border-border"
            >
              <span>Operational Suite</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${modulesDropdownOpen ? 'rotate-180 text-primary' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {modulesDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-72 bg-surface border-2 border-border rounded-2xl p-2.5 shadow-[6px_6px_0_#000] space-y-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <Link
                  to="/buy"
                  className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-2 transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-primary/20 text-primary border border-primary/30">
                    <Ticket className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-comic text-base text-text group-hover:text-primary block leading-tight">
                      Attendee Checkout
                    </span>
                    <span className="text-[10px] font-mono text-text-muted">30-sec UPI booking flow</span>
                  </div>
                </Link>

                <Link
                  to="/cash"
                  className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-2 transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-warning/20 text-warning border border-warning/30">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-comic text-base text-text group-hover:text-warning block leading-tight">
                      Venue Cash Token
                    </span>
                    <span className="text-[10px] font-mono text-text-muted">Self-service queue bypass</span>
                  </div>
                </Link>

                <Link
                  to="/gate"
                  className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-2 transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-info/20 text-info border border-info/30">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-comic text-base text-text group-hover:text-info block leading-tight">
                      Gate Camera Scanner
                    </span>
                    <span className="text-[10px] font-mono text-text-muted">&lt;500ms anti-passback ingress</span>
                  </div>
                </Link>

                <Link
                  to="/pos"
                  className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-2 transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-warning/20 text-warning border border-warning/30">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-comic text-base text-text group-hover:text-warning block leading-tight">
                      Box Office POS Desk
                    </span>
                    <span className="text-[10px] font-mono text-text-muted">Keyboard-first cashier counter</span>
                  </div>
                </Link>

                <Link
                  to="/admin"
                  className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-surface-2 transition-colors group"
                >
                  <div className="p-2 rounded-lg bg-accent/20 text-accent border border-accent/30">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-comic text-base text-text group-hover:text-accent block leading-tight">
                      Super Admin Control
                    </span>
                    <span className="text-[10px] font-mono text-text-muted">Live virtual ledger & PIN safety</span>
                  </div>
                </Link>
              </div>
            )}
          </div>

          {/* My Ticket Recovery Link */}
          <Link
            to="/my-ticket"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-bold text-text hover:text-primary hover:bg-surface-2 border border-border transition-all shadow-[2px_2px_0_#000]"
          >
            <Ticket className="w-3.5 h-3.5 text-primary" />
            <span>My Pass</span>
          </Link>

          {/* Organizer pitch page */}
          <Link
            to="/organizers"
            title="For Organizers"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-bold text-text hover:text-warning hover:bg-surface-2 border border-border transition-all shadow-[2px_2px_0_#000]"
          >
            <Rocket className="w-3.5 h-3.5 text-warning" />
            <span className="sr-only">For Organizers</span>
          </Link>

          {/* Staff Login Link */}
          <Link
            to="/staff"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-mono font-bold text-text-muted hover:text-info hover:border-info border border-border bg-surface-2 transition-all"
            title="Staff Operations"
          >
            <Shield className="w-3.5 h-3.5 text-info" />
            <span>Staff Portal</span>
          </Link>

          {/* Primary Action Button (Comic Yellow Glow) */}
          <ComicButton
            variant="primary"
            size="sm"
            onClick={() => {
              if (location.pathname === '/') {
                const el = document.getElementById('live-events');
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth' });
                  return;
                }
              }
              navigate(`/buy?eventId=${activeEvent.eventId}`);
            }}
            className="px-4 py-2 text-sm shadow-[3px_3px_0_#000] hover:scale-105"
          >
            <span>GET PASS ₹{activeEvent.totalPriceRupees || activeEvent.basePriceRupees || '50'}</span>
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </ComicButton>
        </div>

        {/* Mobile Hamburger Toggle */}
        <div className="flex xl:hidden items-center gap-2 shrink-0">
          <Link
            to={`/buy?eventId=${activeEvent.eventId}`}
            className="inline-flex items-center justify-center min-h-11 whitespace-nowrap font-comic text-sm bg-primary text-black px-3 py-2 rounded-lg border border-black shadow-[2px_2px_0_#000]"
          >
            GET PASS
          </Link>

          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-surface-2 border border-border text-text hover:text-primary transition-colors"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <nav id="mobile-navigation" aria-label="Main navigation" className="mobile-navigation xl:hidden absolute inset-x-0 top-full bg-surface border-b-2 border-border p-4 space-y-3 overflow-y-auto overscroll-contain shadow-[6px_6px_0_#000]">
          {/* Live Events List Mobile */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono font-bold text-text-muted uppercase px-1">
              Active Events ({events.length || 1})
            </span>
            {(events.length > 0 ? events : [activeEvent]).map(ev => (
              <Link
                key={ev.eventId}
                to={`/buy?eventId=${ev.eventId}`}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between p-2.5 rounded-xl bg-accent/15 border-2 border-accent text-accent font-mono text-xs font-bold"
              >
                <div className="flex items-center gap-2 truncate">
                  <Flame className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{ev.name}</span>
                </div>
                <span className="font-comic text-sm text-primary flex-shrink-0">
                  ₹{ev.totalPriceRupees || ev.basePriceRupees || '50'} →
                </span>
              </Link>
            ))}
          </div>

          {/* Quick Links List */}
          <div className="grid grid-cols-2 gap-2 font-mono text-xs font-bold">
            <Link
              to="/buy"
              onClick={() => setMobileMenuOpen(false)}
              className="p-2.5 rounded-xl bg-surface-2 border border-border flex items-center gap-2 text-text hover:text-primary"
            >
              <Ticket className="w-4 h-4 text-primary" />
              <span>Book Ticket</span>
            </Link>

            <Link
              to="/cash"
              onClick={() => setMobileMenuOpen(false)}
              className="p-2.5 rounded-xl bg-surface-2 border border-border flex items-center gap-2 text-text hover:text-warning"
            >
              <DollarSign className="w-4 h-4 text-warning" />
              <span>Cash Token</span>
            </Link>

            <Link
              to="/my-ticket"
              onClick={() => setMobileMenuOpen(false)}
              className="p-2.5 rounded-xl bg-surface-2 border border-border flex items-center gap-2 text-text hover:text-accent"
            >
              <Ticket className="w-4 h-4 text-accent" />
              <span>My Pass</span>
            </Link>

            <Link
              to="/organizers"
              onClick={() => setMobileMenuOpen(false)}
              className="p-2.5 rounded-xl bg-surface-2 border border-border flex items-center gap-2 text-text hover:text-warning"
            >
              <Rocket className="w-4 h-4 text-warning" />
              <span>For Organizers</span>
            </Link>

            <Link
              to="/gate"
              onClick={() => setMobileMenuOpen(false)}
              className="p-2.5 rounded-xl bg-surface-2 border border-border flex items-center gap-2 text-text hover:text-info"
            >
              <QrCode className="w-4 h-4 text-info" />
              <span>Gate Scanner</span>
            </Link>

            <Link
              to="/pos"
              onClick={() => setMobileMenuOpen(false)}
              className="p-2.5 rounded-xl bg-surface-2 border border-border flex items-center gap-2 text-text hover:text-warning"
            >
              <Smartphone className="w-4 h-4 text-warning" />
              <span>Box Office POS</span>
            </Link>

            <Link
              to="/staff"
              onClick={() => setMobileMenuOpen(false)}
              className="p-2.5 rounded-xl bg-surface-2 border border-border flex items-center gap-2 text-text hover:text-info"
            >
              <Shield className="w-4 h-4 text-info" />
              <span>Staff Login</span>
            </Link>
          </div>

          <div className="pt-2 border-t border-border">
            <Link
              to="/admin"
              onClick={() => setMobileMenuOpen(false)}
              className="block w-full py-2.5 text-center rounded-xl bg-accent text-white font-comic text-base border-2 border-black shadow-[2px_2px_0_#000]"
            >
              SUPER ADMIN DASHBOARD →
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
