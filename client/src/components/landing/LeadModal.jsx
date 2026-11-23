import React, { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  X, User, Phone, Mail, MessageSquare, Ticket, Send, RefreshCw, AlertTriangle, CheckCircle2,
  ShieldCheck, Clock, Sparkles, Users, Megaphone, Rocket, AtSign, BarChart3, School, CalendarDays
} from 'lucide-react';
import { api } from '../../services/api';
import { playSuccessChime } from '../../utils/audioFeedback';
import { trackEvent } from '../../utils/analytics';
import { Field, inputCls } from './InquiryModal';

/**
 * Lead-capture modal for the non-partner funnels. Submits through the same
 * /inquiries endpoint as sponsor/stall leads, so they land in the admin CRM.
 *  - GROUP:      10+ pass group / college booking (event-specific)
 *  - AMBASSADOR: referral-program application (event-specific)
 *  - ORGANIZER:  B2B "host your event on FlashPass" (platform-level)
 */
const CONFIG = {
  GROUP: {
    a: '#22D3EE', b: '#16A34A', soft: 'rgba(34,211,238,0.25)', icon: Users,
    btn: 'bg-info text-black hover:brightness-110',
    side: 'Bring the squad',
    title: 'Group & college booking',
    pitch: 'Coming with 10+ friends, a college club or an office team? Get one quote for everyone.',
    perks: ['One booking for the whole group', 'Custom quote straight from the organizer', 'Single point of contact on WhatsApp'],
    brandLabel: 'Group / college name', brandIcon: School, brandPh: 'e.g. Jadavpur Univ. Anime Club',
    sizeLabel: 'Group size', sizeIcon: Users, sizePh: 'e.g. 25 people',
    msgPh: 'Which days are you coming? Any tier preference (VIP / general)?',
    cta: 'GET GROUP QUOTE',
    receiptType: 'Group booking'
  },
  AMBASSADOR: {
    a: '#FF2E88', b: '#FFD60A', soft: 'rgba(255,46,136,0.25)', icon: Megaphone,
    btn: 'bg-accent text-white hover:bg-accent-hover',
    side: 'Become an ambassador',
    title: 'Ambassador program',
    pitch: 'Creators, cosplayers & college reps: get your own referral link and earn on every pass your community buys.',
    perks: ['Your personal referral link', 'Commission on every pass sold through it', 'Sales tracked live by the organizer'],
    brandLabel: 'Instagram / YouTube handle', brandIcon: AtSign, brandPh: 'e.g. @cosplay.kolkata',
    sizeLabel: 'Followers / community size', sizeIcon: BarChart3, sizePh: 'e.g. 12k on Instagram',
    msgPh: 'Tell us about your audience and how you would promote the event…',
    cta: 'APPLY AS AMBASSADOR',
    receiptType: 'Ambassador application'
  },
  ORGANIZER: {
    a: '#FFD60A', b: '#FB923C', soft: 'rgba(255,214,10,0.25)', icon: Rocket,
    btn: 'bg-primary text-black hover:bg-primary-dark',
    side: 'Host on FlashPass',
    title: 'Host your event on FlashPass',
    pitch: 'Ticketing, gate scanning, cash counters and live dashboards for your next event — set up for you.',
    perks: ['Online UPI ticketing + venue cash tokens', 'Fraud-proof gate scanning on any phone', 'Live crowd & revenue dashboard'],
    brandLabel: 'Event / organization name', brandIcon: CalendarDays, brandPh: 'e.g. Kolkata Comic Fest',
    sizeLabel: 'Expected daily footfall', sizeIcon: Users, sizePh: 'e.g. 5,000 per day',
    msgPh: 'City, dates, number of days and anything else we should know…',
    cta: 'REQUEST A DEMO',
    receiptType: 'Organizer demo request'
  }
};

const EVENT_TYPES = ['Comic-con / pop culture', 'Music festival / concert', 'College fest', 'Expo / trade show', 'Sports event', 'Other'];

const EMPTY_FORM = { brandName: '', contactPerson: '', phone: '', email: '', category: '', budget: '', message: '' };

export default function LeadModal({ type, events = [], defaultEventId, onClose }) {
  const cfg = CONFIG[type] || CONFIG.GROUP;
  const Icon = cfg.icon;
  const isPlatform = type === 'ORGANIZER';
  const [form, setForm] = useState({ ...EMPTY_FORM, category: isPlatform ? EVENT_TYPES[0] : '' });
  const [eventId, setEventId] = useState(defaultEventId || events[0]?.eventId || 'comics-carnival');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const phone = form.phone.replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.submitInquiry({
        eventId: isPlatform ? 'platform' : eventId,
        type,
        brandName: form.brandName.trim(),
        contactPerson: form.contactPerson.trim(),
        phone,
        email: form.email.trim(),
        category: form.category.trim(),
        budget: form.budget.trim(),
        message: form.message.trim()
      });
      setSuccess({ ...res, contactPerson: form.contactPerson.trim(), phone });
      trackEvent('generate_lead', { lead_type: type });
      playSuccessChime();
      try { confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } }); } catch (err) {}
    } catch (err) {
      setError(err.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const eventOptions = events.length > 0
    ? events.map((ev) => ({ id: ev.eventId, label: `${ev.name}${ev.venue ? ` — ${ev.venue}` : ''}` }))
    : [{ id: 'comics-carnival', label: '3-Day Comics Carnival' }];

  return (
    <div
      className="responsive-dialog fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-start justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-label={cfg.title}
    >
      <div className="relative w-full min-w-0 shrink-0 max-w-4xl my-auto" style={{ '--accent': cfg.a, '--accent-soft': cfg.soft }}>
        <div className="absolute -inset-3 rounded-[2.25rem] blur-2xl opacity-30" style={{ background: `linear-gradient(120deg, ${cfg.a}, ${cfg.b})` }} />
        <div className="relative rounded-[1.75rem] p-[2px] shadow-[10px_10px_0_#000]" style={{ background: `linear-gradient(135deg, ${cfg.a}, ${cfg.b} 60%, ${cfg.a})` }}>
          <div className="relative rounded-[calc(1.75rem-2px)] bg-[#0D0D1A] overflow-hidden grid lg:grid-cols-[280px_minmax(0,1fr)]">
            {/* Side panel */}
            <aside className="relative hidden lg:flex flex-col p-7 overflow-hidden border-r-2 border-dashed border-white/10">
              <div
                className="absolute inset-0 opacity-25"
                style={{ background: `radial-gradient(circle at 0% 0%, ${cfg.a}, transparent 60%), radial-gradient(circle at 100% 100%, ${cfg.b}, transparent 55%)` }}
              />
              <div className="absolute inset-0 bg-halftone opacity-40" />
              <Icon className="absolute -left-10 -bottom-10 w-56 h-56 opacity-[0.07] -rotate-12" style={{ color: cfg.a }} />
              <div className="relative flex-1 flex flex-col">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center border-2 border-black shadow-[3px_3px_0_#000] text-black"
                  style={{ background: `linear-gradient(135deg, ${cfg.a}, ${cfg.b})` }}
                >
                  <Icon className="w-7 h-7" />
                </div>
                <h3
                  className="mt-5 font-comic text-3xl uppercase tracking-wide leading-[0.95]"
                  style={{ color: cfg.a, textShadow: `3px 3px 0 #000, 5px 5px 0 ${cfg.b}55` }}
                >
                  {cfg.side}
                </h3>
                <p className="mt-2 text-sm text-text-muted">{cfg.pitch}</p>
                <ul className="mt-6 space-y-3">
                  {cfg.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-2.5 text-sm text-text">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: cfg.a }} />
                      {perk}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-6 space-y-2 font-mono text-[11px] text-text-muted">
                  <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-info" /> {isPlatform ? 'Goes straight to the FlashPass team' : 'Goes straight to the event admin'}</div>
                  <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-success" /> Reply within 24 hours</div>
                </div>
              </div>
            </aside>

            {/* Main */}
            <div className="relative p-5 sm:p-7">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: cfg.a }}>
                    <Sparkles className="inline w-3 h-3 -mt-0.5" /> {isPlatform ? 'For organizers' : 'Direct to organizer'}
                  </span>
                  <h2 className="font-comic text-2xl sm:text-3xl text-white uppercase tracking-wide leading-tight">
                    {success ? 'Request sent!' : cfg.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="p-2 rounded-xl bg-white/5 hover:bg-danger hover:text-white border border-white/10 text-text-muted transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {success ? (
                <div className="space-y-5">
                  <div className="flex items-center gap-4">
                    <div className="relative w-16 h-16 shrink-0">
                      <span className="absolute inset-0 rounded-full bg-success/30 animate-ping" />
                      <span className="relative w-16 h-16 rounded-full bg-success text-white flex items-center justify-center border-2 border-black shadow-[3px_3px_0_#000]">
                        <CheckCircle2 className="w-9 h-9" />
                      </span>
                    </div>
                    <p className="text-sm text-text-muted">
                      Delivered to the <span className="font-bold" style={{ color: cfg.a }}>{success.eventName}</span> team.
                      We'll reach you on WhatsApp / phone within 24 hours.
                    </p>
                  </div>
                  <div className="relative rounded-2xl bg-[#14142A] border-2 border-white/10 overflow-hidden">
                    <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${cfg.a}, ${cfg.b})` }} />
                    <div className="p-5 grid grid-cols-2 gap-4 font-mono text-xs">
                      <div className="col-span-2 flex items-center justify-between pb-3 border-b-2 border-dashed border-white/10">
                        <span className="text-text-muted uppercase">Reference ID</span>
                        <span className="font-comic text-2xl tracking-wider" style={{ color: cfg.a }}>{success.inquiryId}</span>
                      </div>
                      <div>
                        <div className="text-text-muted uppercase text-[10px]">Type</div>
                        <div className="text-white font-bold">{cfg.receiptType}</div>
                      </div>
                      <div>
                        <div className="text-text-muted uppercase text-[10px]">Name</div>
                        <div className="text-white font-bold truncate">{success.brandName}</div>
                      </div>
                      <div className="col-span-2">
                        <div className="text-text-muted uppercase text-[10px]">Contact</div>
                        <div className="text-white">{success.contactPerson} • {success.phone}</div>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className={`w-full py-3 rounded-xl font-comic text-lg tracking-wide border-2 border-black shadow-[4px_4px_0_#000] hover:-translate-y-0.5 transition-all cursor-pointer ${cfg.btn}`}
                  >
                    DONE
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {isPlatform ? (
                    <Field label="Event type" icon={CalendarDays} chevron>
                      <select value={form.category} onChange={set('category')} className={`${inputCls} cursor-pointer appearance-none`}>
                        {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </Field>
                  ) : (
                    <Field label="Event" icon={Ticket} chevron hint="Delivered to this event's admin">
                      <select
                        value={eventId}
                        onChange={(e) => setEventId(e.target.value)}
                        className={`${inputCls} font-bold cursor-pointer appearance-none`}
                        style={{ color: cfg.a }}
                      >
                        {eventOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    </Field>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label={cfg.brandLabel} icon={cfg.brandIcon} required>
                      <input type="text" required minLength={2} placeholder={cfg.brandPh} value={form.brandName} onChange={set('brandName')} className={inputCls} />
                    </Field>
                    <Field label="Your name" icon={User} required>
                      <input type="text" required minLength={2} placeholder="e.g. Rahul Sen" value={form.contactPerson} onChange={set('contactPerson')} className={inputCls} />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="WhatsApp / mobile (+91)" icon={Phone} required>
                      <input
                        type="tel"
                        required
                        maxLength={10}
                        inputMode="numeric"
                        placeholder="9876543210"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Email" icon={Mail} required>
                      <input type="email" required placeholder="you@example.com" value={form.email} onChange={set('email')} className={inputCls} />
                    </Field>
                  </div>

                  <Field label={cfg.sizeLabel} icon={cfg.sizeIcon}>
                    <input type="text" placeholder={cfg.sizePh} value={form.budget} onChange={set('budget')} className={inputCls} />
                  </Field>

                  <Field label="Message" icon={MessageSquare} iconTop>
                    <textarea rows={3} placeholder={cfg.msgPh} value={form.message} onChange={set('message')} className={`${inputCls} resize-none`} />
                  </Field>

                  {error && (
                    <div className="p-3 rounded-xl bg-danger/15 border-2 border-danger/60 text-danger text-xs font-mono flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className={`w-full inline-flex items-center justify-center gap-2 font-comic text-xl tracking-wider px-5 py-3.5 rounded-xl border-2 border-black shadow-[4px_4px_0_#000] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#000] transition-all cursor-pointer disabled:opacity-60 disabled:pointer-events-none ${cfg.btn}`}
                  >
                    {submitting ? <><RefreshCw className="w-5 h-5 animate-spin" /> SENDING…</> : <><Send className="w-5 h-5" /> {cfg.cta}</>}
                  </button>
                  <p className="text-center text-[10px] font-mono text-text-muted">
                    Fields marked <span style={{ color: 'var(--accent)' }}>*</span> are required
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
