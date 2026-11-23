import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  HelpCircle, Search, ChevronDown, Zap, Smartphone, LifeBuoy,
  DollarSign, ShieldCheck, RefreshCw, Ticket, Sparkles, CheckCircle2,
  ArrowRight, X, MessageSquare, Layers
} from 'lucide-react';
import { SectionHeader } from './Premium';

const CATEGORIES = [
  { id: 'ALL', label: 'All Questions', icon: Layers },
  { id: 'PAYMENTS', label: 'UPI & Cash', icon: Zap },
  { id: 'PASSES', label: 'Passes & Offline', icon: Smartphone },
  { id: 'SECURITY', label: 'Anti-Fraud & Rules', icon: ShieldCheck },
  { id: 'HELP', label: 'Help & Recovery', icon: LifeBuoy }
];

const FAQS_DATA = [
  {
    id: 'faq-pay',
    category: 'PAYMENTS',
    tag: '30-SEC UPI',
    tagColor: 'border-yellow-400/50 bg-yellow-400/15 text-yellow-400',
    iconTileColor: 'from-yellow-400 to-amber-500',
    icon: Zap,
    q: 'How do I pay for my pass?',
    a: 'Checkout is instant via UPI. Tap to pay directly with your preferred UPI app (Google Pay, PhonePe, Paytm, CRED) on mobile, or scan the dynamic UPI QR on desktop. You can book up to 4 passes in a single transaction with instant confirmation.',
    highlight: 'Zero gateway wait time — your digital pass generates in under 500ms right in your browser.'
  },
  {
    id: 'faq-offline',
    category: 'PASSES',
    tag: '100% OFFLINE READY',
    tagColor: 'border-info/50 bg-info/15 text-info',
    iconTileColor: 'from-cyan-400 to-blue-500',
    icon: Smartphone,
    q: 'Do I need to print my ticket or install an app?',
    a: 'No app download or physical printout needed! Your digital pass opens instantly in your browser upon payment. Save it as an image, download a PDF, or add it to your mobile home screen — it scans 100% offline at venue gates even in crowded halls with zero network connectivity.',
    highlight: 'Gate scanners verify cryptographic HMAC signatures locally without relying on venue Wi-Fi.',
    link: { to: '/my-ticket', label: 'View sample pass' }
  },
  {
    id: 'faq-lost',
    category: 'HELP',
    tag: 'INSTANT RECOVERY',
    tagColor: 'border-accent/50 bg-accent/15 text-accent',
    iconTileColor: 'from-pink-500 to-rose-600',
    icon: LifeBuoy,
    q: 'I lost my pass or changed my phone. What now?',
    a: 'No panic! Head over to our ticket recovery page, enter your registered 10-digit mobile number, and all active passes linked to your number will load instantly. No confirmation emails or lost OTPs required.',
    highlight: 'Gate 1 Help Desk volunteers can also look up and print your credentials in seconds.',
    link: { to: '/my-ticket', label: 'Recover my ticket now' }
  },
  {
    id: 'faq-cash',
    category: 'PAYMENTS',
    tag: 'BOX OFFICE CASH',
    tagColor: 'border-yellow-400/50 bg-yellow-400/15 text-yellow-400',
    iconTileColor: 'from-amber-400 to-yellow-600',
    icon: DollarSign,
    q: 'Can I pay cash at the venue box office?',
    a: 'Yes, for events with cash sales enabled. Simply scan the standee QR at the venue entrance to claim a digital Cash Token on your phone, then show your token code to the counter cashier to pay cash and get your pass issued immediately.',
    highlight: 'Cash tokens reserve your ticket inventory for 15 minutes while you queue up at the box office.',
    link: { to: '/cash', label: 'Generate a cash token' }
  },
  {
    id: 'faq-screenshot',
    category: 'SECURITY',
    tag: 'ANTI-FRAUD LOCK',
    tagColor: 'border-red-500/50 bg-red-500/15 text-red-400',
    iconTileColor: 'from-red-500 to-pink-600',
    icon: ShieldCheck,
    q: 'Can my friend use a screenshot of my pass?',
    a: 'Strictly no — screenshot duplication and scalping are completely blocked. Our ingress engine maintains an atomic presence state machine. Once a pass is scanned in at Gate 1, any duplicate scan of the same QR at any gate triggers a loud fraud buzzer and is rejected.',
    highlight: 'Atomic anti-passback ensures 1 pass = exactly 1 person inside the convention arena at all times.'
  },
  {
    id: 'faq-reentry',
    category: 'SECURITY',
    tag: 'RE-ENTRY POLICY',
    tagColor: 'border-accent/50 bg-accent/15 text-accent',
    iconTileColor: 'from-accent to-purple-600',
    icon: RefreshCw,
    q: 'Can I leave the venue and come back later?',
    a: 'Yes, if the event organizer permits re-entry (look for the "Re-Entry Allowed" indicator on the event card). When stepping outside, be sure to scan your pass at the Exit Lane turnstile. This resets your presence status to OUTSIDE, enabling you to scan back in smoothly.',
    highlight: 'Always remember to scan OUT before leaving if you plan to return the same day.'
  },
  {
    id: 'faq-days',
    category: 'PASSES',
    tag: 'TIER VALIDITY',
    tagColor: 'border-info/50 bg-info/15 text-info',
    iconTileColor: 'from-info to-cyan-600',
    icon: Ticket,
    q: 'Which days is my pass valid for?',
    a: 'For multi-day conventions, full All-Access passes cover the entire event run (e.g., all 3 days). If you purchased a single-day pass, it is valid specifically for your chosen date. Your pass validity dates are clearly marked on your ticket and verified before checkout.',
    highlight: 'VIP and Cosplayer passes additionally unlock fast-track VIP entrance lanes and green room access.'
  },
  {
    id: 'faq-cracked',
    category: 'HELP',
    tag: 'GATE ASSISTANCE',
    tagColor: 'border-emerald-400/50 bg-emerald-400/15 text-emerald-400',
    iconTileColor: 'from-emerald-400 to-teal-600',
    icon: Sparkles,
    q: 'My phone screen is cracked and the gate scanner won’t read the QR.',
    a: 'No problem at all! Gate volunteers are equipped with supervisor handhelds. If your screen glass is broken or unreadable by optical scanners, staff can look up and admit you in 5 seconds using your short Order ID (e.g. CC-RZA7UTBQ) or registered phone number.',
    highlight: 'Manual lookup and verification stations are stationed at every entry gate.',
    link: { to: '/my-ticket', label: 'Look up your Order ID' }
  }
];

export default function FaqSection() {
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [openItems, setOpenItems] = useState(() => new Set(['faq-pay'])); // first one open by default

  const toggleItem = (id) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExpandAll = () => {
    setOpenItems(new Set(FAQS_DATA.map((f) => f.id)));
  };

  const handleCollapseAll = () => {
    setOpenItems(new Set());
  };

  // Filter questions by category and search
  const filteredFaqs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return FAQS_DATA.filter((item) => {
      const matchesCategory = activeCategory === 'ALL' || item.category === activeCategory;
      if (!matchesCategory) return false;
      if (!q) return true;
      return (
        item.q.toLowerCase().includes(q) ||
        item.a.toLowerCase().includes(q) ||
        item.tag.toLowerCase().includes(q)
      );
    });
  }, [activeCategory, searchQuery]);

  return (
    <section id="faq" className="relative py-20 px-4 border-b-2 border-border/60 overflow-hidden scroll-mt-20 bg-gradient-to-b from-[#090915] via-[#0C0C1C] to-[#090915]">
      {/* Ambient Cyber Halos */}
      <div className="pointer-events-none absolute -top-24 left-1/4 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-1/4 w-96 h-96 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-[400px] bg-info/5 rounded-full blur-[140px]" />

      <div className="relative max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <SectionHeader
          icon={HelpCircle}
          eyebrow="Knowledge Base & Support"
          title={<>Frequently <span className="text-primary">Asked</span> Questions</>}
          subtitle="Everything you need to know about UPI payments, gate ingress rules, offline passes, and fraud prevention."
        />

        {/* Controls Bar: Category Pills + Search Box */}
        <div className="space-y-4">
          {/* Category Tabs */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              const count = cat.id === 'ALL'
                ? FAQS_DATA.length
                : FAQS_DATA.filter((f) => f.category === cat.id).length;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl font-mono text-xs font-bold transition-all duration-200 border-2 shadow-[2px_2px_0_#000] cursor-pointer ${
                    isActive
                      ? 'bg-primary text-black border-black shadow-[3px_3px_0_#000] -translate-y-0.5'
                      : 'bg-surface-2/90 text-text-muted hover:text-white hover:bg-surface border-border/80'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-black' : 'text-primary'}`} />
                  <span>{cat.label}</span>
                  <span
                    className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-black text-primary' : 'bg-surface border border-white/10 text-text-muted'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search + Expand/Collapse Bar */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                type="text"
                placeholder="Search questions... e.g. 'cash', 'screenshot', 'offline', 'refund'"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#111122]/90 border-2 border-border focus:border-primary rounded-xl pl-10 pr-10 py-2.5 font-mono text-xs text-text placeholder-text-muted/60 focus:outline-none transition-colors shadow-[2px_2px_0_#000]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-text-muted hover:text-white"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto font-mono text-xs">
              <button
                type="button"
                onClick={handleExpandAll}
                className="px-3 py-2 rounded-xl bg-surface-2 hover:bg-surface border border-border text-text-muted hover:text-white transition-all shadow-[2px_2px_0_#000] cursor-pointer"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                className="px-3 py-2 rounded-xl bg-surface-2 hover:bg-surface border border-border text-text-muted hover:text-white transition-all shadow-[2px_2px_0_#000] cursor-pointer"
              >
                Collapse all
              </button>
            </div>
          </div>
        </div>

        {/* FAQ Accordion List */}
        <div className="space-y-3.5">
          {filteredFaqs.length === 0 ? (
            <div className="text-center py-12 px-4 rounded-2xl bg-surface-2/60 border-2 border-dashed border-border space-y-3">
              <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center mx-auto text-text-muted">
                <Search className="w-6 h-6" />
              </div>
              <p className="font-comic text-xl text-white">No questions matched your search</p>
              <p className="text-xs font-mono text-text-muted max-w-sm mx-auto">
                Try searching with different keywords or switch back to "All Questions".
              </p>
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setActiveCategory('ALL'); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-black font-mono text-xs font-bold border border-black shadow-[2px_2px_0_#000] hover:bg-yellow-300 transition-all cursor-pointer"
              >
                Reset Search Filters
              </button>
            </div>
          ) : (
            filteredFaqs.map((f, i) => {
              const isOpen = openItems.has(f.id);
              const Icon = f.icon;

              return (
                <div
                  key={f.id}
                  className={`group rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
                    isOpen
                      ? 'bg-[#101024] border-primary/70 shadow-[0_0_25px_rgba(255,214,10,0.18),4px_4px_0_#000] -translate-y-0.5'
                      : 'bg-[#0D0D1A]/95 border-white/10 hover:border-white/25 shadow-[4px_4px_0_#000]'
                  }`}
                >
                  {/* Question Header Button */}
                  <button
                    type="button"
                    onClick={() => toggleItem(f.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-3.5 p-4 sm:p-5 text-left cursor-pointer transition-colors"
                  >
                    {/* Themed Icon Tile */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center border-2 border-black shadow-[2px_2px_0_#000] shrink-0 text-black bg-gradient-to-br ${f.iconTileColor} transition-transform duration-300 group-hover:scale-105`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    {/* Question + Category Badge */}
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-md font-mono text-[9px] font-bold uppercase tracking-wider border ${f.tagColor}`}>
                          {f.tag}
                        </span>
                        <span className="text-[10px] font-mono text-text-muted">
                          #{String(i + 1).padStart(2, '0')}
                        </span>
                      </div>
                      <h3 className={`font-comic text-lg sm:text-xl tracking-wide leading-tight transition-colors ${
                        isOpen ? 'text-primary' : 'text-white group-hover:text-primary/90'
                      }`}>
                        {f.q}
                      </h3>
                    </div>

                    {/* Animated Chevron Button */}
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all duration-300 shrink-0 ${
                        isOpen
                          ? 'bg-primary text-black border-black shadow-[2px_2px_0_#000] rotate-180'
                          : 'bg-surface-2 text-text-muted border-border group-hover:text-white'
                      }`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </button>

                  {/* Accordion Answer Content */}
                  {isOpen && (
                    <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-white/[0.06] sm:pl-[4.5rem] space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      <p className="text-sm text-text-muted leading-relaxed font-sans">
                        {f.a}
                      </p>

                      {/* Pro-Tip Highlight Callout Pill */}
                      {f.highlight && (
                        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-2/90 border border-white/10 text-xs font-mono text-text">
                          <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <span className="leading-snug">{f.highlight}</span>
                        </div>
                      )}

                      {/* Action Link Button */}
                      {f.link && (
                        <div className="pt-1">
                          <Link
                            to={f.link.to}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary/10 hover:bg-primary border border-primary/40 text-primary hover:text-black font-mono text-xs font-bold transition-all shadow-[2px_2px_0_#000] hover:shadow-[3px_3px_0_#000]"
                          >
                            <span>{f.link.label}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Support Kiosk / Helpdesk Card */}
        <div className="p-6 rounded-3xl bg-gradient-to-r from-primary/15 via-[#111122] to-accent/15 border-2 border-primary/40 shadow-[4px_4px_0_#000] flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-4 text-center sm:text-left">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-yellow-400 to-amber-500 text-black flex items-center justify-center font-bold border-2 border-black shadow-[3px_3px_0_#000] shrink-0">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-comic text-xl text-white uppercase tracking-wide">
                Still have questions or facing an issue?
              </h4>
              <p className="text-xs font-mono text-text-muted mt-0.5">
                Our team is stationed at Gate 1 Help Desk throughout the convention. Recover your digital ticket anytime with your phone number.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto">
            <Link
              to="/my-ticket"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-yellow-300 text-black font-mono text-xs font-bold border-2 border-black shadow-[3px_3px_0_#000] hover:-translate-y-0.5 transition-all"
            >
              <span>FIND MY PASS</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/cash"
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-2 hover:bg-white text-text-muted hover:text-black font-mono text-xs font-bold border border-border shadow-[2px_2px_0_#000] transition-all"
            >
              <span>CASH TOKEN</span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

