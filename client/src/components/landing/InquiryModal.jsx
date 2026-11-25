import React, { useEffect } from 'react';
import {
  X, Building2, Store, User, Phone, Mail, Crown, Wallet, Tag, MessageSquare,
  Ticket, Send, RefreshCw, AlertTriangle, CheckCircle2, ShieldCheck, Clock, Sparkles, ChevronDown, Lock, IndianRupee
} from 'lucide-react';
import { STALL_OPTIONS, findStall, formatRupees } from '../../utils/stalls';

const THEMES = {
  SPONSOR: {
    a: '#FFD60A', b: '#FB923C', soft: 'rgba(255,214,10,0.25)', icon: Building2,
    btn: 'bg-primary text-black hover:bg-primary-dark',
    title: 'Event Sponsorship Inquiry',
    pitch: 'Put your brand in front of thousands of high-intent fans.',
    perks: ['Stage, gate & wristband branding', 'Logo on every digital FlashPass', 'VIP hospitality & backstage access']
  },
  STALL: {
    a: '#FF2E88', b: '#22D3EE', soft: 'rgba(255,46,136,0.25)', icon: Store,
    btn: 'bg-accent text-white hover:bg-accent-hover',
    title: 'Exhibition Stall Inquiry',
    pitch: 'Sell your art, merch or food to an enthusiastic crowd.',
    perks: ['Half booths from ₹5,000 to food stalls', 'Fixed, transparent stall prices', 'Tell us your offer — we reply in 24 h']
  }
};

export const inputCls =
  'w-full bg-[#14142A] border-2 border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm text-text placeholder-text-muted/50 ' +
  'focus:outline-none focus:border-[color:var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)] transition-all';

export function Field({ label, icon: Icon, required, children, hint, iconTop = false, chevron = false }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between mb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted">
        <span>{label}{required && <span style={{ color: 'var(--accent)' }}> *</span>}</span>
        {hint && <span className="normal-case tracking-normal text-info">{hint}</span>}
      </span>
      <span className="relative block">
        <Icon className={`absolute left-3 w-4 h-4 text-text-muted pointer-events-none ${iconTop ? 'top-3.5' : 'top-1/2 -translate-y-1/2'}`} />
        {children}
        {chevron && <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />}
      </span>
    </label>
  );
}

export default function InquiryModal({
  type, setType, events, selectedEventId, setSelectedEventId,
  form, setForm, submitting, success, error, onSubmit, onClose, onReset
}) {
  const theme = THEMES[type] || THEMES.SPONSOR;
  const TypeIcon = theme.icon;
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const stall = findStall(form.stallType) || STALL_OPTIONS[0];

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

  const eventOptions = events.length > 0
    ? events.map((ev) => ({ id: ev.eventId, label: `${ev.name}${ev.venue ? ` — ${ev.venue}` : ''}` }))
    : [{ id: 'platform', label: 'FlashPass (no event yet)' }];

  return (
    <div
      className="responsive-dialog fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-start justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain"
      role="dialog"
      aria-modal="true"
      aria-label={theme.title}
    >
      <div className="relative w-full min-w-0 shrink-0 max-w-4xl my-auto animate-in fade-in zoom-in-95 duration-200" style={{ '--accent': theme.a, '--accent-soft': theme.soft }}>
        <div
          className="absolute -inset-3 rounded-[2.25rem] blur-2xl opacity-30"
          style={{ background: `linear-gradient(120deg, ${theme.a}, ${theme.b})` }}
        />
        <div
          className="relative rounded-[1.75rem] p-[2px] shadow-[10px_10px_0_#000]"
          style={{ background: `linear-gradient(135deg, ${theme.a}, ${theme.b} 60%, ${theme.a})` }}
        >
          <div className="relative rounded-[calc(1.75rem-2px)] bg-[#0D0D1A] overflow-hidden grid lg:grid-cols-[280px_minmax(0,1fr)]">
            {/* ===== Side panel ===== */}
            <aside className="relative hidden lg:flex flex-col p-7 overflow-hidden border-r-2 border-dashed border-white/10">
              <div
                className="absolute inset-0 opacity-25"
                style={{ background: `radial-gradient(circle at 0% 0%, ${theme.a}, transparent 60%), radial-gradient(circle at 100% 100%, ${theme.b}, transparent 55%)` }}
              />
              <div className="absolute inset-0 bg-halftone opacity-40" />
              <TypeIcon className="absolute -left-10 -bottom-10 w-56 h-56 opacity-[0.07] -rotate-12" style={{ color: theme.a }} />

              <div className="relative flex-1 flex flex-col">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center border-2 border-black shadow-[3px_3px_0_#000] text-black"
                  style={{ background: `linear-gradient(135deg, ${theme.a}, ${theme.b})` }}
                >
                  <TypeIcon className="w-7 h-7" />
                </div>
                <h3
                  className="mt-5 font-comic text-3xl uppercase tracking-wide leading-[0.95]"
                  style={{ color: theme.a, textShadow: `3px 3px 0 #000, 5px 5px 0 ${theme.b}55` }}
                >
                  {type === 'SPONSOR' ? 'Partner with us' : 'Claim your stall'}
                </h3>
                <p className="mt-2 text-sm text-text-muted">{theme.pitch}</p>

                <ul className="mt-6 space-y-3">
                  {theme.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-2.5 text-sm text-text">
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: theme.a }} />
                      {perk}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto pt-6 space-y-2 font-mono text-[11px] text-text-muted">
                  <div className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-info" /> Goes straight to the event admin</div>
                  <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-success" /> Reply within 24 hours</div>
                </div>
              </div>
            </aside>

            {/* ===== Main ===== */}
            <div className="relative p-5 sm:p-7">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: theme.a }}>
                    <Sparkles className="inline w-3 h-3 -mt-0.5" /> Direct to organizer
                  </span>
                  <h2 className="font-comic text-2xl sm:text-3xl text-white uppercase tracking-wide leading-tight">
                    {success ? 'Inquiry sent!' : theme.title}
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
                /* ===== Success ===== */
                <div className="space-y-5">
                  <div className="flex items-center gap-4">
                    <div className="relative w-16 h-16 shrink-0">
                      <span className="absolute inset-0 rounded-full bg-success/30 animate-ping" />
                      <span className="relative w-16 h-16 rounded-full bg-success text-white flex items-center justify-center border-2 border-black shadow-[3px_3px_0_#000]">
                        <CheckCircle2 className="w-9 h-9" />
                      </span>
                    </div>
                    <p className="text-sm text-text-muted">
                      Delivered to the <span className="font-bold" style={{ color: theme.a }}>{success.eventName}</span> admin dashboard.
                      The partnerships team will reach you on WhatsApp / phone within 24 hours.
                    </p>
                  </div>

                  {/* Receipt ticket */}
                  <div className="relative rounded-2xl bg-[#14142A] border-2 border-white/10 overflow-hidden">
                    <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${theme.a}, ${theme.b})` }} />
                    <div className="p-5 grid grid-cols-2 gap-4 font-mono text-xs">
                      <div className="col-span-2 flex items-center justify-between pb-3 border-b-2 border-dashed border-white/10">
                        <span className="text-text-muted uppercase">Reference ID</span>
                        <span className="font-comic text-2xl tracking-wider" style={{ color: theme.a }}>{success.inquiryId}</span>
                      </div>
                      <div>
                        <div className="text-text-muted uppercase text-[10px]">Type</div>
                        <div className="text-white font-bold">{success.type === 'SPONSOR' ? 'Sponsorship' : 'Exhibition stall'}</div>
                      </div>
                      <div>
                        <div className="text-text-muted uppercase text-[10px]">Brand</div>
                        <div className="text-white font-bold truncate">{success.brandName}</div>
                      </div>
                      {success.stallLabel && (
                        <>
                          <div>
                            <div className="text-text-muted uppercase text-[10px]">Stall</div>
                            <div className="text-white font-bold">{success.stallLabel}</div>
                          </div>
                          <div>
                            <div className="text-text-muted uppercase text-[10px]">Price</div>
                            <div className="font-bold" style={{ color: theme.a }}>{formatRupees(success.stallPriceRupees)}</div>
                          </div>
                        </>
                      )}
                      <div className="col-span-2">
                        <div className="text-text-muted uppercase text-[10px]">Contact</div>
                        <div className="text-white">{success.contactPerson} • {success.phone}</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={onReset}
                      className="py-3 rounded-xl font-comic text-lg tracking-wide bg-white/5 hover:bg-white/10 text-text border-2 border-white/15 transition-all cursor-pointer"
                    >
                      SUBMIT ANOTHER
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className={`py-3 rounded-xl font-comic text-lg tracking-wide border-2 border-black shadow-[4px_4px_0_#000] hover:-translate-y-0.5 transition-all cursor-pointer ${theme.btn}`}
                    >
                      DONE
                    </button>
                  </div>
                </div>
              ) : (
                /* ===== Form ===== */
                <form onSubmit={onSubmit} className="space-y-4">
                  {/* Type switcher */}
                  <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-black/40 border border-white/10">
                    {[
                      { key: 'SPONSOR', label: 'Sponsorship', Icon: Building2, active: 'bg-primary text-black' },
                      { key: 'STALL', label: 'Vendor stall', Icon: Store, active: 'bg-accent text-white' }
                    ].map(({ key, label, Icon, active }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setType(key)}
                        className={`py-2.5 rounded-xl font-comic text-lg tracking-wide transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          type === key ? `${active} shadow-[2px_2px_0_#000] border-2 border-black` : 'text-text-muted hover:text-white border-2 border-transparent'
                        }`}
                      >
                        <Icon className="w-4 h-4" /> {label}
                      </button>
                    ))}
                  </div>

                  <Field label="Target event" icon={Ticket} chevron hint="Delivered to this event's admin">
                    <select
                      value={selectedEventId}
                      onChange={(e) => setSelectedEventId(e.target.value)}
                      className={`${inputCls} font-bold cursor-pointer appearance-none`}
                      style={{ color: theme.a }}
                    >
                      {eventOptions.map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label={type === 'SPONSOR' ? 'Brand / company' : 'Studio / stall name'} icon={type === 'SPONSOR' ? Building2 : Store} required>
                      <input
                        type="text"
                        required
                        placeholder={type === 'SPONSOR' ? 'e.g. Red Bull India' : 'e.g. MangaCraft Studio'}
                        value={form.brandName}
                        onChange={set('brandName')}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Contact person" icon={User} required>
                      <input type="text" required placeholder="e.g. Rahul Sen" value={form.contactPerson} onChange={set('contactPerson')} className={inputCls} />
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
                      <input type="email" required placeholder="partner@brand.com" value={form.email} onChange={set('email')} className={inputCls} />
                    </Field>
                  </div>

                  {type === 'SPONSOR' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="Sponsorship tier" icon={Crown} chevron>
                        <select value={form.sponsorshipTier} onChange={set('sponsorshipTier')} className={`${inputCls} cursor-pointer appearance-none`}>
                          <option value="TITLE_SPONSOR">👑 Title Sponsor (Main Stage Naming)</option>
                          <option value="POWERED_BY">⚡ Powered By Sponsor</option>
                          <option value="ASSOCIATE_SPONSOR">★ Associate Sponsor</option>
                          <option value="MERCH_PARTNER">👕 Merch & Lanyard Partner</option>
                          <option value="GAMING_ARENA">🎮 Gaming Arena Sponsor</option>
                        </select>
                      </Field>
                      <Field label="Estimated budget" icon={Wallet}>
                        <input type="text" placeholder="e.g. ₹50,000 – ₹2,00,000" value={form.budget} onChange={set('budget')} className={inputCls} />
                      </Field>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_190px] gap-3">
                        <Field label="Stall size / booth type" icon={Store} chevron required>
                          <select value={stall.id} onChange={set('stallType')} className={`${inputCls} pr-9 cursor-pointer appearance-none`}>
                            {STALL_OPTIONS.map((s) => (
                              <option key={s.id} value={s.id}>{s.emoji} {s.label} — {formatRupees(s.priceRupees)}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Stall price" icon={IndianRupee} hint="Fixed">
                          <input
                            type="text"
                            readOnly
                            tabIndex={-1}
                            aria-readonly="true"
                            value={stall.priceRupees.toLocaleString('en-IN')}
                            title="Price is set by the organizer for this stall size"
                            className={`${inputCls} pr-9 font-comic text-lg tracking-wide cursor-not-allowed select-none border-dashed`}
                            style={{ color: theme.a, background: 'rgba(0,0,0,0.35)' }}
                          />
                          <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                        </Field>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Merchandise category" icon={Tag}>
                          <input type="text" placeholder="e.g. Anime posters, manga, props" value={form.category} onChange={set('category')} className={inputCls} />
                        </Field>
                        <Field label="Anything about the price?" icon={Wallet}>
                          <input
                            type="text"
                            maxLength={500}
                            placeholder="e.g. Can you do ₹8,000? / Need 2 stalls"
                            value={form.priceNote || ''}
                            onChange={set('priceNote')}
                            className={inputCls}
                          />
                        </Field>
                      </div>
                    </div>
                  )}

                  <Field label="Requirements / message" icon={MessageSquare} iconTop>
                    <textarea
                      rows={3}
                      placeholder="Any specific power, space or branding preferences…"
                      value={form.message}
                      onChange={set('message')}
                      className={`${inputCls} resize-none`}
                    />
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
                    className={`w-full inline-flex items-center justify-center gap-2 font-comic text-xl tracking-wider px-5 py-3.5 rounded-xl border-2 border-black shadow-[4px_4px_0_#000] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#000] transition-all cursor-pointer disabled:opacity-60 disabled:pointer-events-none ${theme.btn}`}
                  >
                    {submitting ? (
                      <><RefreshCw className="w-5 h-5 animate-spin" /> SENDING…</>
                    ) : (
                      <><Send className="w-5 h-5" /> SEND {type === 'SPONSOR' ? 'SPONSORSHIP' : 'STALL'} INQUIRY</>
                    )}
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
