import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { api } from '../services/api';
import ComicButton from '../components/common/ComicButton';
import Header from '../components/common/Header';
import EventShowcaseCard from '../components/landing/EventShowcaseCard';
import PartnerOfferCard from '../components/landing/PartnerOfferCard';
import InquiryModal from '../components/landing/InquiryModal';
import LeadModal from '../components/landing/LeadModal';
import SiteFooter from '../components/landing/SiteFooter';
import FaqSection from '../components/landing/FaqSection';
import { trackEvent } from '../utils/analytics';
import { SectionHeader, PremiumPanel, IconTile } from '../components/landing/Premium';
import { playSuccessChime } from '../utils/audioFeedback';
import {
  Zap, Ticket, ShieldCheck, QrCode, Users, ArrowRight, Sparkles, Flame, CheckCircle2, HelpCircle,
  ChevronRight, Radio, Megaphone, X, Building2, Store, Phone, Send, Check, HeartHandshake, Tag,
  Rocket
} from 'lucide-react';

// three.js is heavy — load the 3D mascot in its own chunk
// If the 3D hero file can't load (weak network, offline), show an empty stage
// instead of letting the failed import blank the whole page
const AnimeHero3D = lazy(() => import('../components/landing/AnimeHero3D').catch(() => ({
  default: () => <div className="w-full h-full rounded-[2rem] bg-primary/5" aria-hidden="true" />
})));

// Sponsor / stall offers rendered by PartnerOfferCard
const PARTNER_OFFERS = [
  {
    type: 'SPONSOR',
    icon: Building2,
    theme: { a: '#FFD60A', b: '#FB923C', text: '#FFD60A', btn: 'bg-primary text-black hover:bg-primary-dark' },
    badge: 'Brand visibility & ROI',
    kicker: 'Multi-tier packages',
    title: 'Become an official event sponsor',
    description: 'Put your brand in front of thousands of high-intent Gen-Z and pop-culture attendees with verified stage presence, digital pass branding, VIP hospitality and co-marketing.',
    stats: [
      { value: '1000s', label: 'Daily reach' },
      { value: 'Stage+Pass', label: 'Placements' },
      { value: '24h', label: 'Response' }
    ],
    perks: [
      { title: 'Prime stage & gate banners', text: 'High-density logo placement across the main cosplay runway, entrance arch & wristbands.' },
      { title: 'Logo on every digital FlashPass', text: 'Your brand showcased on every pass downloaded to attendee phones.' },
      { title: 'VIP access & direct admin channel', text: 'Dedicated organizer coordination, VIP lounge passes & backstage speaker invites.' }
    ],
    cta: 'ENQUIRE FOR SPONSORSHIP',
    footnote: 'Direct notification to the event admin • Response within 24 hours'
  },
  {
    type: 'STALL',
    icon: Store,
    theme: { a: '#FF2E88', b: '#22D3EE', text: '#FF2E88', btn: 'bg-accent text-white hover:bg-accent-hover' },
    badge: 'Direct commerce & audience',
    kicker: 'Limited spaces',
    title: 'Book creator & food stalls',
    description: 'Showcase indie art prints, comics, action figures, anime merch, apparel or food counters to enthusiastic crowds in guaranteed high-footfall zones.',
    stats: [
      { value: '6×3→10×10', label: 'Stall sizes (ft)' },
      { value: '2–4', label: 'Staff passes' },
      { value: 'Wi-Fi', label: 'Power & UPI' }
    ],
    perks: [
      { title: 'Curated artist alley & vendor zones', text: 'From 6×3 ft creator tables to premium 10×10 ft branded exhibition booths.' },
      { title: 'Power, lighting & event Wi-Fi', text: 'Uninterrupted UPI payment support, lighting points & secure overnight storage.' },
      { title: 'Complimentary staff all-access passes', text: 'Every stall booking includes 2–4 complimentary exhibitor credentials.' }
    ],
    cta: 'BOOK AN EXHIBITION STALL',
    footnote: 'Stall inventory allocated on a first-come, first-approved basis'
  }
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [eventData, setEventData] = useState(null);
  const [allEvents, setAllEvents] = useState([]);
  const [savedPass, setSavedPass] = useState(null);
  const [activeAnnouncementIdx, setActiveAnnouncementIdx] = useState(0);
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);
  // Group / ambassador / organizer lead modal ('GROUP' | 'AMBASSADOR' | 'ORGANIZER' | null)
  const [leadType, setLeadType] = useState(null);
  const [affiliateCode, setAffiliateCode] = useState(null);

  // Sponsorship & Vendor Stall Booking Inquiries State
  const [inquiryModalOpen, setInquiryModalOpen] = useState(false);
  // Starts collapsed as a small pill so it never covers the hero CTAs
  const [floatingPartnerDismissed, setFloatingPartnerDismissed] = useState(true);
  const [inquiryType, setInquiryType] = useState('SPONSOR'); // 'SPONSOR' | 'STALL'
  const [inquirySelectedEventId, setInquirySelectedEventId] = useState('');
  const [inquiryForm, setInquiryForm] = useState({
    brandName: '',
    contactPerson: '',
    phone: '',
    email: '',
    category: '',
    stallType: 'STANDARD_BOOTH',
    sponsorshipTier: 'ASSOCIATE_SPONSOR',
    budget: '',
    message: ''
  });
  const [inquirySubmitting, setInquirySubmitting] = useState(false);
  const [inquirySuccess, setInquirySuccess] = useState(null);
  const [inquiryError, setInquiryError] = useState(null);

  const handleOpenInquiry = (type = 'SPONSOR', targetEventId = null) => {
    setInquiryType(type);
    const chosenEvent = targetEventId || eventData?.eventId || allEvents[0]?.eventId || 'comics-carnival';
    setInquirySelectedEventId(chosenEvent);
    setInquirySuccess(null);
    setInquiryError(null);
    setInquiryModalOpen(true);
  };

  const handleSubmitInquiry = async (e) => {
    e.preventDefault();
    setInquiryError(null);

    if (!inquiryForm.brandName.trim()) {
      setInquiryError('Brand / Organization name is required');
      return;
    }
    if (!inquiryForm.contactPerson.trim()) {
      setInquiryError('Contact person name is required');
      return;
    }
    const cleanPhone = inquiryForm.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setInquiryError('Please enter a valid 10-digit mobile number');
      return;
    }

    setInquirySubmitting(true);
    try {
      const payload = {
        eventId: inquirySelectedEventId || eventData?.eventId || 'comics-carnival',
        type: inquiryType,
        brandName: inquiryForm.brandName.trim(),
        contactPerson: inquiryForm.contactPerson.trim(),
        phone: cleanPhone.slice(-10),
        email: inquiryForm.email.trim(),
        category: inquiryForm.category.trim(),
        stallType: inquiryType === 'STALL' ? inquiryForm.stallType : undefined,
        sponsorshipTier: inquiryType === 'SPONSOR' ? inquiryForm.sponsorshipTier : undefined,
        budget: inquiryForm.budget.trim(),
        message: inquiryForm.message.trim()
      };

      const res = await api.submitInquiry(payload);
      // API returns the inquiry summary directly; contact details come from the form for the receipt
      setInquirySuccess({ ...res, contactPerson: payload.contactPerson, phone: payload.phone });
      trackEvent('generate_lead', { lead_type: inquiryType });
      playSuccessChime();
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (e) {}
    } catch (err) {
      setInquiryError(err.message || 'Failed to submit inquiry. Please try again.');
    } finally {
      setInquirySubmitting(false);
    }
  };

  useEffect(() => {
    // Check localStorage for existing pass
    try {
      const stored = localStorage.getItem('cc_active_pass');
      if (stored) {
        setSavedPass(JSON.parse(stored));
      }
    } catch (e) {}

    // Read ref parameter (Influencer / Ambassador Tracking)
    const searchParams = new URLSearchParams(window.location.search);
    const refParam = searchParams.get('ref');
    const eventIdParam = searchParams.get('eventId');
    if (refParam) {
      setAffiliateCode(refParam);
      localStorage.setItem('cc_affiliate_ref', refParam);
    }

    // Fetch dynamic event info from API
    api.getEventInfo(eventIdParam, refParam)
      .then(data => {
        setEventData(data);
        document.title = 'FlashPass — High-Speed Ingress & Ticketing';
      })
      .catch(err => console.error(err));

    // Fetch all active events created by Super Admin
    api.getAllPublicEvents()
      .then(events => setAllEvents(events))
      .catch(err => console.error('Failed to load all events', err));
  }, []);

  // Auto-cycle announcements if multiple exist
  useEffect(() => {
    if (eventData?.liveAnnouncements && eventData.liveAnnouncements.length > 1) {
      const interval = setInterval(() => {
        setActiveAnnouncementIdx(prev => (prev + 1) % eventData.liveAnnouncements.length);
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [eventData?.liveAnnouncements]);

  const pricing = eventData?.pricing || {
    basePriceRupees: '50.00',
    platformFeeRupees: '2.00',
    totalPriceRupees: '52.00'
  };

  const badgeText = eventData?.todayBadge || '3-DAY ALL ACCESS';

  // Event promoted by the mobile sticky buy bar: first one currently selling

  // schema.org Event markup so search engines can show rich event results
  useEffect(() => {
    if (allEvents.length === 0) return undefined;
    const data = allEvents
      .map((ev) => {
        const dates = (ev.eventDays || []).map((d) => d.date).filter(Boolean).sort();
        if (dates.length === 0) return null;
        return {
          '@context': 'https://schema.org',
          '@type': 'Event',
          name: ev.name,
          description: ev.announcementText || undefined,
          startDate: dates[0],
          endDate: dates[dates.length - 1],
          eventStatus: 'https://schema.org/EventScheduled',
          eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
          location: { '@type': 'Place', name: ev.venue, address: ev.venue },
          offers: {
            '@type': 'Offer',
            url: `${window.location.origin}/buy?eventId=${ev.eventId}`,
            price: ev.totalPriceRupees,
            priceCurrency: 'INR',
            availability: ev.onlineSalesEnabled !== false ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut'
          }
        };
      })
      .filter(Boolean);
    if (data.length === 0) return undefined;
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(data);
    document.head.appendChild(script);
    return () => script.remove();
  }, [allEvents]);

  return (
    <div className={`landing-page min-h-screen bg-bg text-text flex flex-col selection:bg-primary selection:text-black`}>
      <Header />

      {/* 1. Continuous Live Ticker Tape (Marquee Animation) */}
      <div className="bg-primary text-black border-b-2 border-black font-mono text-[11px] font-bold py-1.5 overflow-hidden select-none">
        <div className="animate-marquee flex items-center gap-8 whitespace-nowrap">
          <span>⚡ FLASHPASS v2.0 • HIGH-SPEED EVENT INGRESS ENGINE</span>
          <span>★ LIVE AT 3-DAY COMICS CARNIVAL 2026</span>
          <span>🚫 ATOMIC ANTI-PASSBACK (ZERO SCREENSHOT FRAUD)</span>
          <span>💸 ₹0 SMS/WHATSAPP BILLS (CLIENT-SIDE VECTOR EXPORT)</span>
          <span>📱 PWA OFFLINE CAPABLE (WORKS WITHOUT VENUE CELL RECEPTION)</span>
          <span>⏱️ SUB-500ms CAMERA SCANNING WITH AUDIO FEEDBACK</span>
          <span>⌨️ 10-SECOND BOX OFFICE POS (KEYBOARD-FIRST)</span>
          <span>👑 REAL-TIME FINANCIAL VIRTUAL LEDGER & PIN SECURITY</span>
          <span>☁️ 100% COMPATIBLE: AWS EC2 / DOCKER & CPANEL PASSENGER</span>
          {/* Duplicate set for seamless continuous loop */}
          <span>⚡ FLASHPASS v2.0 • HIGH-SPEED EVENT INGRESS ENGINE</span>
          <span>★ LIVE AT 3-DAY COMICS CARNIVAL 2026</span>
          <span>🚫 ATOMIC ANTI-PASSBACK (ZERO SCREENSHOT FRAUD)</span>
          <span>💸 ₹0 SMS/WHATSAPP BILLS (CLIENT-SIDE VECTOR EXPORT)</span>
          <span>📱 PWA OFFLINE CAPABLE (WORKS WITHOUT VENUE CELL RECEPTION)</span>
        </div>
      </div>

      {/* Ambassador / Influencer Referral Banner */}
      {(eventData?.ambassador || affiliateCode) && (
        <div className="bg-[#00F5A0]/10 border-b-2 border-[#00F5A0]/50 px-4 py-2">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-[#00F5A0]">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#00F5A0]" />
              <span>
                Referred by Ambassador: <strong>{eventData?.ambassador?.name || affiliateCode}</strong>! Special community perks unlocked.
              </span>
            </div>
            <span className="bg-[#00F5A0]/20 text-[#00F5A0] px-2 py-0.5 rounded font-bold uppercase text-[10px] border border-[#00F5A0]/40">
              Verified Invite
            </span>
          </div>
        </div>
      )}

      {/* Floating Dynamic Island Live Broadcast HUD (Shifted to Floating Bottom-Center with Gentle Bobbing & Neon Glow) */}
      {eventData?.liveAnnouncements && eventData.liveAnnouncements.length > 0 && (
        <>
          {!announcementDismissed ? (
            <aside
              aria-label="Live Announcement"
              className="live-announcement relative mx-4 my-3 sm:mx-6 xl:fixed xl:bottom-6 xl:right-6 xl:m-0 xl:w-[360px] z-30 pointer-events-none"
            >
              <div className="pointer-events-auto relative group">
                {/* Luminous Neon Gradient Aura (Floating Energy Glow) */}
                <div className="absolute -inset-1 bg-gradient-to-r from-accent via-primary to-info rounded-2xl blur-lg opacity-50 group-hover:opacity-90 transition-opacity duration-500 animate-glow-pulse" />

                {/* Compact Toast Card */}
                <div className="relative bg-[#0F0F1E]/95 backdrop-blur-2xl border-2 border-accent/90 rounded-2xl p-3 shadow-[0_12px_40px_-5px_rgba(255,46,136,0.4),4px_4px_0_#000000] flex items-start gap-3 overflow-hidden">
                  {/* Subtle Scanline Shimmer Sweep */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent pointer-events-none -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

                  {/* Left: Electric Radar Beacon */}
                  <div className="relative flex items-center justify-center w-8 h-8 shrink-0 rounded-xl bg-accent/20 border-2 border-accent text-accent shadow-[2px_2px_0_#000]">
                    <Radio className="w-4 h-4 animate-pulse" />
                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent shadow-[0_0_8px_#FF2E88]"></span>
                    </span>
                  </div>

                  {/* Center: Live Tag + Announcement Text */}
                  <div className="flex-1 min-w-0">
                    <span className="font-comic text-xs tracking-wider text-accent uppercase drop-shadow-[1px_1px_0_#000]">
                      LIVE STAGE • NOW
                    </span>
                    <p className="font-sans font-semibold text-xs text-text leading-snug xl:line-clamp-2">
                      {eventData.liveAnnouncements[activeAnnouncementIdx]?.text || eventData.liveAnnouncements[0].text}
                    </p>
                  </div>

                  {/* Right: Pager Dots & Dismiss Close Button */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {eventData.liveAnnouncements.length > 1 && (
                      <div className="hidden sm:flex items-center gap-1 bg-surface-2/80 px-1.5 py-1 rounded-lg border border-border order-2">
                        {eventData.liveAnnouncements.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setActiveAnnouncementIdx(i)}
                            className={`w-2 h-2 rounded-full transition-all ${
                              i === activeAnnouncementIdx
                                ? 'bg-accent w-4'
                                : 'bg-text-muted/40 hover:bg-text-muted'
                            }`}
                            title={`Announcement ${i + 1}`}
                          />
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setAnnouncementDismissed(true)}
                      className="p-1.5 rounded-xl bg-surface-2/80 hover:bg-accent hover:text-white border border-border text-text-muted transition-all shadow-[1px_1px_0_#000]"
                      title="Dismiss announcement"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                </div>
              </div>
            </aside>
          ) : (
            /* Collapsed Floating Radar Beacon in Bottom-Right Corner */
            <button
              type="button"
              onClick={() => setAnnouncementDismissed(false)}
              className="relative self-end mx-4 my-3 xl:fixed xl:bottom-6 xl:right-6 xl:m-0 z-30 p-2.5 sm:px-3.5 sm:py-2 bg-[#0F0F1E]/95 hover:bg-surface-2 border-2 border-accent text-accent rounded-2xl shadow-[0_8px_25px_rgba(255,46,136,0.35),3px_3px_0_#000] flex items-center gap-2 font-mono text-xs font-bold transition-all hover:scale-105 animate-float-gentle group"
              title="Re-open Live Broadcast"
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent"></span>
              </span>
              <Radio className="w-4 h-4 text-accent animate-pulse" />
              <span className="font-comic text-xs uppercase tracking-wider hidden sm:inline text-white group-hover:text-accent">
                LIVE STAGE FEED
              </span>
            </button>
          )}
        </>
      )}

      {/* 2. Hero Section with Motion Animations */}
      <section className="landing-hero relative overflow-hidden pt-6 sm:pt-8 pb-10 sm:pb-14 px-4 sm:px-6 border-b-2 border-border/60 bg-halftone">
        {/* Ambient color glows */}
        <div className="pointer-events-none absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-0 w-[520px] h-[520px] rounded-full bg-accent/10 blur-3xl" />

        <div className="relative max-w-7xl mx-auto grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-6 lg:gap-4 items-center">
          {/* 3D Anime Mascot Stage */}
          <div className="hero-stage relative min-w-0 order-2">
            <Suspense fallback={<div className="w-full h-full rounded-[2rem] bg-primary/5 animate-pulse" />}>
              <AnimeHero3D />
            </Suspense>
          </div>

        <div className="min-w-0 order-1 text-center lg:text-left space-y-4 sm:space-y-5">
          {/* Saved Pass Quick Card (If user has an active pass) */}
          {savedPass && (
            <Link
              to={`/pass/${savedPass.orderId}`}
              className="group relative flex items-stretch max-w-md mx-auto lg:mx-0 text-left bg-surface border-2 border-primary rounded-2xl shadow-[4px_4px_0_#000] hover:shadow-[6px_6px_0_#FFD60A] hover:-translate-y-0.5 transition-all overflow-hidden"
            >
              <div className="flex items-center justify-center px-3.5 bg-primary">
                <Ticket className="w-6 h-6 text-black group-hover:rotate-12 transition-transform" />
              </div>
              <div className="flex-1 min-w-0 px-4 py-2.5 border-r-2 border-dashed border-primary/40">
                <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-success uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  Your pass is ready
                </div>
                <div className="font-mono text-sm font-bold text-text truncate">{savedPass.orderId}</div>
              </div>
              <div className="flex items-center gap-1 px-4 font-comic text-lg tracking-wide text-primary whitespace-nowrap">
                OPEN
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          )}

          {/* Eyebrow Pill */}
          <div className="inline-flex items-center gap-2 bg-surface-2 border-2 border-primary/60 px-4 py-1.5 rounded-full shadow-[2px_2px_0_#000]">
            <Zap className="w-4 h-4 text-primary fill-primary animate-pulse" />
            <span className="font-mono text-xs font-bold text-primary tracking-wider uppercase">
              NEXT-GEN EVENT TICKETING & GATE INGRESS ENGINE
            </span>
          </div>

          {/* Main Headline */}
          <h1 className="hero-heading font-comic text-text tracking-wide leading-none max-w-4xl mx-auto lg:mx-0 drop-shadow-[4px_4px_0_#000]">
            ZERO GATE QUEUES.<br />
            <span className="text-primary drop-shadow-[2px_2px_0_#000]">ZERO SCREENSHOT FRAUD.</span><br />
            <span className="text-accent drop-shadow-[2px_2px_0_#000]">ZERO DELIVERY FEES.</span>
          </h1>

          {/* Subtitle */}
          <p className="text-text-muted text-sm sm:text-base max-w-2xl mx-auto lg:mx-0 font-sans leading-relaxed">
            FlashPass is the complete operating system engineered for physical conventions, festivals, expos, and crowded stadiums. Designed with <strong>atomic anti-passback ingress</strong>, <strong>instant UPI checkout</strong>, <strong>10-second cash counters</strong>, and <strong>real-time financial virtual ledgers</strong>.
          </p>

          {/* Action CTAs */}
          <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto lg:mx-0">
            <ComicButton
              variant="primary"
              size="lg"
              onClick={() => {
                const el = document.getElementById('live-events');
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth' });
                } else {
                  navigate(`/buy?eventId=${allEvents[0]?.eventId || 'comics-carnival'}`);
                }
              }}
              className="sm:col-span-2 animate-neon-glow"
            >
              <span>{allEvents.length > 1 ? `EXPLORE LIVE EVENTS (${allEvents.length})` : 'BOOK PASS (LIVE)'}</span>
              <ArrowRight className="w-5 h-5 ml-2" />
            </ComicButton>

            <ComicButton
              variant="secondary"
              size="lg"
              onClick={() => {
                const el = document.getElementById('partnerships');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="border-accent text-accent hover:bg-accent hover:text-white"
            >
              <HeartHandshake className="w-5 h-5 mr-1.5" />
              <span>SPONSORS & STALLS</span>
            </ComicButton>

            <ComicButton
              variant="outline"
              size="lg"
              onClick={() => setLeadType('GROUP')}
              className="border-info text-info hover:text-white"
            >
              <Users className="w-5 h-5 mr-2" />
              <span>GROUP BOOKING</span>
            </ComicButton>

            <ComicButton
              variant="outline"
              size="lg"
              onClick={() => navigate('/organizers')}
              className="sm:col-span-2 border-warning text-warning hover:text-white"
            >
              <Rocket className="w-5 h-5 mr-1.5" />
              <span>HOST YOUR EVENT ON FLASHPASS</span>
            </ComicButton>
          </div>

          {/* Quick Direct Pass Buttons for Multiple Running Events */}
          {allEvents.length > 1 && (
            <div className="pt-4 flex flex-wrap items-center justify-center lg:justify-start gap-2.5">
              <span className="text-xs font-mono font-bold text-text-muted flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-accent" /> Active Events:
              </span>
              {allEvents.map((ev, i) => (
                <button
                  key={ev.eventId || i}
                  type="button"
                  onClick={() => navigate(`/buy?eventId=${ev.eventId}${affiliateCode ? `&ref=${affiliateCode}` : ''}`)}
                  className="px-3.5 py-1.5 rounded-xl bg-surface-2 hover:bg-surface border-2 border-border hover:border-primary text-xs font-mono font-bold text-text hover:text-primary transition-all flex items-center gap-2 shadow-[2px_2px_0_#000] cursor-pointer group"
                >
                  <Ticket className="w-3.5 h-3.5 text-primary group-hover:rotate-12 transition-transform" />
                  <span>{ev.name}</span>
                  <span className="text-primary font-comic text-sm">₹{ev.basePriceRupees || '50'}</span>
                  <span className="text-[10px] text-accent">Book Pass →</span>
                </button>
              ))}
            </div>
          )}
        </div>
        </div>
      </section>

      {/* 3. Live Client Events Showcase Powered by FlashPass */}
      <section id="live-events" className="relative py-10 sm:py-16 px-4 sm:px-6 border-b-2 border-border/60 overflow-hidden">
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[400px] rounded-full bg-accent/10 blur-3xl" />
        <div className="relative max-w-6xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-6 sm:mb-10 space-y-3">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-2 border-2 border-accent/60 font-mono text-[11px] font-bold text-accent uppercase tracking-wider shadow-[2px_2px_0_#000]">
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex w-full h-full rounded-full bg-accent opacity-75 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-accent" />
              </span>
              {allEvents.length || 1} {(allEvents.length || 1) === 1 ? 'event' : 'events'} live in production
            </span>
            <h2 className="font-comic text-4xl sm:text-6xl text-white tracking-wide uppercase drop-shadow-[4px_4px_0_#000]">
              Live events <span className="text-primary">powered by</span> <span className="text-accent">FlashPass</span>
            </h2>
            <p className="text-sm text-text-muted max-w-xl mx-auto">
              Grab your digital pass in 30 seconds — instant UPI checkout, offline-ready passes and zero gate queues.
            </p>
          </div>

          <div className="space-y-6 sm:space-y-10">
            {(allEvents.length > 0 ? allEvents : [{
              eventId: 'comics-carnival',
              name: '3-Day Comics Carnival',
              venue: 'Milan Mela Prangan, Kolkata',
              announcementText: 'West Bengal’s premier pop-culture convention. Over 3,000 daily attendees with sub-500ms ingress and 100% screenshot fraud prevention.',
              totalPriceRupees: pricing.totalPriceRupees,
              basePriceRupees: pricing.basePriceRupees,
              platformFeeRupees: pricing.platformFeeRupees,
              allowReentry: true,
              onlineSalesEnabled: true
            }]).map((ev, idx) => (
              <EventShowcaseCard
                key={ev.eventId || idx}
                ev={ev}
                index={idx}
                affiliateCode={affiliateCode}
                onInquiry={handleOpenInquiry}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 3.5. SPONSORSHIPS & EXHIBITION STALLS SHOWCASE */}
      <section id="partnerships" className="relative py-10 sm:py-16 px-4 sm:px-6 border-b-2 border-border/60 overflow-hidden">
        <div className="pointer-events-none absolute -top-24 left-1/4 w-[500px] h-[400px] rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-1/4 w-[500px] h-[400px] rounded-full bg-accent/10 blur-3xl" />

        <div className="relative max-w-6xl mx-auto">
          {/* Section header */}
          <div className="text-center mb-6 sm:mb-10 space-y-3">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-2 border-2 border-primary/60 font-mono text-[11px] font-bold text-primary uppercase tracking-wider shadow-[2px_2px_0_#000]">
              <Sparkles className="w-3.5 h-3.5" /> Partnership & exhibitor opportunities
            </span>
            <h2 className="font-comic text-4xl sm:text-6xl text-white tracking-wide uppercase drop-shadow-[4px_4px_0_#000]">
              Grow your brand with <span className="text-primary">massive</span> <span className="text-accent">footfall</span>
            </h2>
            <p className="text-sm text-text-muted max-w-xl mx-auto">
              Prime stage sponsorship or a high-converting stall for art, merch & food — send an inquiry straight to the event organizers.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
            {PARTNER_OFFERS.map((offer) => (
              <PartnerOfferCard key={offer.type} offer={offer} onClick={() => handleOpenInquiry(offer.type)} />
            ))}
          </div>

          {/* How it works */}
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { icon: Send, title: 'Send inquiry', text: 'Takes under a minute — brand, contact & budget.', color: 'text-primary' },
              { icon: ShieldCheck, title: 'Organizer review', text: 'The event admin is notified directly and evaluates it.', color: 'text-info' },
              { icon: Phone, title: 'Confirmed on WhatsApp', text: 'Hear back within 24 hours with next steps.', color: 'text-accent' }
            ].map(({ icon: Icon, title, text, color }, i) => (
              <div key={title} className="flex items-start gap-3 p-4 rounded-2xl bg-surface/80 border-2 border-border shadow-[4px_4px_0_#000]">
                <div className="relative w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0">
                  <Icon className={`w-5 h-5 ${color}`} />
                  <span className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-white text-black font-mono text-[10px] font-bold flex items-center justify-center border-2 border-black">{i + 1}</span>
                </div>
                <div>
                  <div className="font-comic text-lg text-white uppercase tracking-wide leading-tight">{title}</div>
                  <div className="text-xs text-text-muted">{text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Squad: group bookings & ambassador program */}
      <section className="relative py-10 sm:py-16 px-4 sm:px-6 border-b-2 border-border/60 overflow-hidden">
        <div className="pointer-events-none absolute top-10 -left-40 w-[560px] h-[420px] rounded-full bg-info/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 -right-40 w-[560px] h-[420px] rounded-full bg-accent/10 blur-3xl" />
        <div className="relative max-w-6xl mx-auto">
          <SectionHeader
            icon={Users}
            tone="info"
            eyebrow="Better together"
            title={<>Bring the <span className="text-info">squad</span>, earn with your <span className="text-accent">crew</span></>}
            subtitle="Book for your whole group in one go — or spread the word and earn on every pass your community buys."
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              {
                type: 'GROUP', a: '#22D3EE', b: '#16A34A', icon: Users, kicker: '10+ people', title: 'Group & college booking',
                text: 'College clubs, cosplay crews, office teams — get one custom quote from the organizer for the whole group.',
                perks: ['One booking for everyone', 'Custom group quote', 'Single WhatsApp contact'],
                cta: 'Get group quote', btn: 'bg-info text-black'
              },
              {
                type: 'AMBASSADOR', a: '#FF2E88', b: '#FFD60A', icon: Megaphone, kicker: 'Creators & college reps', title: 'Become an ambassador',
                text: 'Get your own referral link. Every pass bought through it earns you commission — tracked live by the organizer.',
                perks: ['Personal referral link', 'Commission per pass', 'Live sales tracking'],
                cta: 'Apply now', btn: 'bg-accent text-white'
              }
            ].map((c) => (
              <PremiumPanel key={c.type} a={c.a} b={c.b} watermark={c.icon} innerClassName="p-6 sm:p-8 flex flex-col gap-5">
                <div className="flex items-center gap-3">
                  <IconTile icon={c.icon} a={c.a} b={c.b} />
                  <div>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: c.a }}>{c.kicker}</span>
                    <h3 className="font-comic text-3xl text-white uppercase tracking-wide leading-none">{c.title}</h3>
                  </div>
                </div>
                <p className="text-sm text-text-muted leading-relaxed">{c.text}</p>
                <div className="grid grid-cols-3 gap-2">
                  {c.perks.map((p) => (
                    <div key={p} className="rounded-xl bg-white/[0.04] border border-white/10 p-3 text-center">
                      <CheckCircle2 className="w-4 h-4 mx-auto mb-1" style={{ color: c.a }} />
                      <span className="text-[11px] text-text leading-tight block">{p}</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setLeadType(c.type)}
                  className={`mt-auto inline-flex items-center justify-center gap-2 py-3.5 rounded-xl font-comic text-xl tracking-wide border-2 border-black shadow-[4px_4px_0_#000] hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0.5 active:shadow-[2px_2px_0_#000] transition-all cursor-pointer ${c.btn}`}
                >
                  {c.cta} <ArrowRight className="w-5 h-5" />
                </button>
              </PremiumPanel>
            ))}
          </div>
        </div>
      </section>

      {/* 5. FAQ */}
      <FaqSection />

      {/* 6. Organizer teaser (full pitch lives on /organizers) */}
      <section className="relative py-10 sm:py-16 px-4 sm:px-6 overflow-hidden">
        <div className="relative max-w-6xl mx-auto">
          <PremiumPanel a="#FFD60A" b="#22D3EE" watermark={Rocket} innerClassName="p-6 sm:p-10 grid lg:grid-cols-[1.3fr_1fr] gap-8 items-center">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-info/15 border border-info/40 font-mono text-[10px] font-bold uppercase tracking-wider text-info">
                <Rocket className="w-3.5 h-3.5" /> For organizers
              </span>
              <h2 className="font-comic text-4xl sm:text-5xl text-white uppercase tracking-wide leading-none drop-shadow-[3px_3px_0_#000]">
                Organizing an event? <span className="text-primary">Run it on FlashPass</span>
              </h2>
              <p className="text-sm text-text-muted max-w-xl">
                Ticketing, cash counters, fraud-proof gate scanning and a live revenue dashboard — the same system powering the events above.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Link
                  to="/organizers"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-primary text-black font-comic text-xl tracking-wide border-2 border-black shadow-[4px_4px_0_#000] hover:-translate-y-0.5 transition-all"
                >
                  See how it works <ArrowRight className="w-5 h-5" />
                </Link>
                <button
                  type="button"
                  onClick={() => setLeadType('ORGANIZER')}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-white/5 text-white font-comic text-xl tracking-wide border-2 border-white/20 shadow-[4px_4px_0_#000] hover:border-info hover:text-info hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  Request a demo
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Ticket, label: 'UPI ticketing', c: '#FFD60A' },
                { icon: QrCode, label: '<500ms gate scan', c: '#22D3EE' },
                { icon: ShieldCheck, label: 'Zero screenshot fraud', c: '#FF2E88' },
                { icon: Radio, label: 'Live dashboard', c: '#16A34A' }
              ].map(({ icon: Icon, label, c }) => (
                <div key={label} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 hover:-translate-y-0.5 transition-transform">
                  <Icon className="w-6 h-6 mb-2" style={{ color: c }} />
                  <div className="font-comic text-lg text-white tracking-wide leading-tight uppercase">{label}</div>
                </div>
              ))}
            </div>
          </PremiumPanel>
        </div>
      </section>

      <SiteFooter />

      {/* Floating Partnership & Stall Booking Dock (Eye-Catching Cyber-Card with Dynamic Success Feedback) */}
      {inquirySuccess ? (
        /* State 1: When Inquiry is Successfully Submitted -> Transform into Glowing Success Confirmation */
        !floatingPartnerDismissed ? (
          <aside
            aria-label="Inquiry Submitted Confirmation"
            className="hidden min-[1440px]:block fixed bottom-6 left-6 z-40 max-w-sm w-[calc(100%-2rem)] sm:w-auto animate-float-gentle pointer-events-none"
          >
            <div className="pointer-events-auto relative group">
              {/* Luminous Green Halo Aura */}
              <div className="absolute -inset-1 bg-gradient-to-r from-success via-info to-primary rounded-3xl blur-md opacity-85 group-hover:opacity-100 transition-opacity duration-500 animate-glow-pulse" />

              <div className="relative bg-[#081510]/95 backdrop-blur-2xl border-2 border-success rounded-3xl p-4 sm:p-5 shadow-[0_15px_35px_rgba(0,0,0,0.8),4px_4px_0_#000] space-y-2.5 overflow-hidden">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-success text-black flex items-center justify-center font-bold border-2 border-black shadow-[2px_2px_0_#000] shrink-0">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-success/20 text-success border border-success/40 inline-block uppercase tracking-wider">
                        ✓ INQUIRY SENT
                      </span>
                      <h4 className="font-comic text-base sm:text-lg text-white uppercase tracking-wide leading-tight mt-0.5">
                        SUCCESSFULLY TRANSMITTED!
                      </h4>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFloatingPartnerDismissed(true)}
                    className="p-1 rounded-xl bg-surface-2 hover:bg-danger hover:text-white border border-border text-text-muted transition-all shadow-[1px_1px_0_#000] cursor-pointer"
                    title="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-2.5 rounded-xl bg-surface-2/80 border border-border text-xs font-mono space-y-1">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Ref ID:</span>
                    <strong className="text-primary font-bold">{inquirySuccess.inquiryId}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Brand:</span>
                    <span className="text-white truncate max-w-[170px]">{inquirySuccess.brandName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Target Event:</span>
                    <span className="text-info truncate max-w-[170px]">{inquirySuccess.eventName}</span>
                  </div>
                </div>

                <p className="text-[10px] font-mono text-text-muted flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-success animate-ping"></span>
                  <span>Event team will connect with you via WhatsApp soon!</span>
                </p>

                <div className="pt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setInquiryModalOpen(true)}
                    className="flex-1 py-1.5 px-3 rounded-xl bg-surface-2 hover:bg-white text-text-muted hover:text-black font-mono text-xs font-bold border border-border transition-all shadow-[2px_2px_0_#000] cursor-pointer"
                  >
                    View Receipt
                  </button>
                  <button
                    type="button"
                    onClick={() => setFloatingPartnerDismissed(true)}
                    className="py-1.5 px-3 rounded-xl bg-success text-black font-mono text-xs font-bold border border-black shadow-[2px_2px_0_#000] hover:bg-success/90 transition-all cursor-pointer"
                  >
                    Got It ✓
                  </button>
                </div>
              </div>
            </div>
          </aside>
        ) : (
          /* Collapsed Floating Success Pill */
          <button
            type="button"
            onClick={() => setFloatingPartnerDismissed(false)}
            className="hidden min-[1440px]:block fixed bottom-6 left-6 z-40 p-2 sm:px-3.5 sm:py-2 bg-[#081510]/95 hover:bg-surface-2 border-2 border-success text-success rounded-2xl shadow-[0_10px_25px_rgba(0,245,160,0.35),3px_3px_0_#000] flex items-center gap-2 font-mono text-xs font-bold transition-all hover:scale-105 animate-float-gentle group cursor-pointer"
            title="View Submitted Inquiry Status"
          >
            <span className="w-2 h-2 rounded-full bg-success animate-ping"></span>
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span className="font-comic text-xs uppercase tracking-wider text-white group-hover:text-success">
              INQUIRY SENT ({inquirySuccess.inquiryId})
            </span>
          </button>
        )
      ) : (
        /* State 2: Normal Floating Callout before user submits an inquiry */
        !inquiryModalOpen && (
          !floatingPartnerDismissed ? (
            <aside
              aria-label="Sponsorship & Stalls Callout"
              className="hidden min-[1440px]:block fixed bottom-6 left-6 z-40 max-w-sm w-[calc(100%-2rem)] sm:w-auto animate-float-gentle pointer-events-none"
            >
              <div className="pointer-events-auto relative group">
                {/* Ambient Multi-Color Neon Halo Aura */}
                <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 via-accent to-info rounded-3xl blur-md opacity-75 group-hover:opacity-100 transition-opacity duration-500 animate-glow-pulse" />

                {/* Cyberpunk Floating Card Body */}
                <div className="relative bg-[#0E0E1C]/95 backdrop-blur-2xl border-2 border-yellow-400 rounded-3xl p-4 sm:p-5 shadow-[0_15px_35px_rgba(0,0,0,0.8),4px_4px_0_#000] space-y-3 overflow-hidden">
                  {/* Header inside Capsule */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-2xl bg-yellow-400 text-black flex items-center justify-center font-bold border-2 border-black shadow-[2px_2px_0_#000] shrink-0">
                        <HeartHandshake className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-yellow-400/20 text-yellow-400 border border-yellow-400/50 inline-block uppercase tracking-wider">
                          ★ PARTNER WITH US ★
                        </span>
                        <h4 className="font-comic text-base sm:text-lg text-white uppercase tracking-wide leading-tight mt-0.5">
                          WANT TO SPONSOR OR PUT A STALL?
                        </h4>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setFloatingPartnerDismissed(true)}
                      className="p-1 rounded-xl bg-surface-2 hover:bg-danger hover:text-white border border-border text-text-muted transition-all shadow-[1px_1px_0_#000] cursor-pointer"
                      title="Minimize"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-[11px] font-mono text-text-muted leading-relaxed">
                    Connect directly with event organizers to promote your brand or sell creator merchandise to thousands of fans.
                  </p>

                  {/* Action Buttons */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenInquiry('SPONSOR')}
                      className="w-full py-2 px-2.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-black font-mono text-[11px] font-bold border-2 border-black shadow-[2px_2px_0_#000] hover:shadow-[3px_3px_0_#000] transition-all flex items-center justify-center gap-1.5 active:translate-y-0.5 cursor-pointer"
                    >
                      <Building2 className="w-3.5 h-3.5 text-black" />
                      <span>SPONSOR EVENT</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenInquiry('STALL')}
                      className="w-full py-2 px-2.5 rounded-xl bg-accent hover:bg-pink-600 text-white font-mono text-[11px] font-bold border-2 border-black shadow-[2px_2px_0_#000] hover:shadow-[3px_3px_0_#000] transition-all flex items-center justify-center gap-1.5 active:translate-y-0.5 cursor-pointer"
                    >
                      <Store className="w-3.5 h-3.5 text-white" />
                      <span>BOOK A STALL</span>
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          ) : (
            /* Collapsed Side Tab docked to the left screen edge (never covers page content) */
            <div className="hidden min-[1440px]:block fixed left-0 top-1/2 -translate-y-1/2 z-40">
              <div className="partner-tab-nudge relative">
                <span className="absolute -top-2.5 -right-3 z-10 bg-accent text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-full border-2 border-black shadow-[1px_1px_0_#000] animate-bounce">
                  HOT
                </span>
                <button
                  type="button"
                  onClick={() => setFloatingPartnerDismissed(false)}
                  className="relative overflow-hidden px-2.5 py-5 [writing-mode:vertical-rl] rotate-180 bg-primary hover:bg-primary-dark text-black border-2 border-r-0 border-black rounded-l-xl animate-neon-glow flex items-center gap-2.5 transition-all hover:px-3.5 group cursor-pointer"
                  title="Open Sponsorship & Stall Options"
                >
                  <span className="partner-tab-shine absolute inset-x-0 h-10 bg-gradient-to-b from-transparent via-white/70 to-transparent pointer-events-none" />
                  <HeartHandshake className="relative w-5 h-5 rotate-90 group-hover:scale-125 transition-transform" />
                  <span className="relative font-comic text-lg uppercase tracking-wider leading-none drop-shadow-[1px_1px_0_rgba(255,255,255,0.6)]">
                    SPONSOR / STALL
                  </span>
                </button>
              </div>
            </div>
          )
        )
      )}

      {leadType && (
        <LeadModal
          type={leadType}
          events={allEvents}
          defaultEventId={eventData?.eventId}
          onClose={() => setLeadType(null)}
        />
      )}

      {/* SPONSOR & STALL INQUIRY MODAL */}
      {inquiryModalOpen && (
        <InquiryModal
          type={inquiryType}
          setType={setInquiryType}
          events={allEvents}
          selectedEventId={inquirySelectedEventId}
          setSelectedEventId={setInquirySelectedEventId}
          form={inquiryForm}
          setForm={setInquiryForm}
          submitting={inquirySubmitting}
          success={inquirySuccess}
          error={inquiryError}
          onSubmit={handleSubmitInquiry}
          onClose={() => setInquiryModalOpen(false)}
          onReset={() => {
            setInquirySuccess(null);
            setInquiryForm({
              brandName: '',
              contactPerson: '',
              phone: '',
              email: '',
              category: '',
              stallType: 'STANDARD_BOOTH',
              sponsorshipTier: 'ASSOCIATE_SPONSOR',
              budget: '',
              message: ''
            });
          }}
        />
      )}
    </div>
  );
}
