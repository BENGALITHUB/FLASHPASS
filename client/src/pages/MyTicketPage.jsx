import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import ComicButton from '../components/common/ComicButton';
import ComicBadge from '../components/common/ComicBadge';
import Header from '../components/common/Header';
import './MyTicketPage.css';
import {
  ArrowRight, Search, HelpCircle, AlertCircle, Ticket, Zap, QrCode,
  Smartphone, Hash, ChevronDown, ChevronUp, Sparkles, MapPin, Loader2, Check, ShieldCheck
} from 'lucide-react';

// Same look as the landing hero's 3D pass: yellow halftone card, magenta strip, comic ink outline
function PassIllustration() {
  return (
    <div className="vault-art hidden lg:block" aria-hidden="true">
      <div className="vault-rays" />
      <div className="vault-glow vault-glow-yellow" />
      <div className="vault-glow vault-glow-magenta" />
      <div className="vault-card-back vault-card-back-cyan" />
      <div className="vault-card-back vault-card-back-magenta" />
      <div className="vault-ticket">
        <div className="vault-ticket-sheen" />
        <div className="vault-ticket-head flex items-center justify-between gap-4 px-5 py-2.5">
          <span className="flex items-center gap-2 font-comic text-2xl tracking-wider"><Zap className="h-5 w-5 fill-current" /> FLASHPASS</span>
          <span className="font-mono text-[9px] font-bold tracking-[0.22em]">THE MOMENT IS YOURS</span>
        </div>
        <div className="relative flex">
          <div className="relative min-w-0 flex-1 px-5 py-4 xl:px-6">
            <p className="vault-ink-soft font-mono text-[10px] font-bold uppercase tracking-[0.2em]">All access • 3-day pass</p>
            <p className="vault-ticket-heading mt-2 font-comic text-5xl leading-[0.92] xl:text-6xl">MAKE IT<br />MEMORABLE.</p>
            <div className="vault-ink-soft mt-3 flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-wider"><span className="h-1.5 w-1.5 rounded-full bg-black" /> Find it. Open it. Show up.</div>
          </div>
          <div className="vault-ticket-stub relative flex w-28 shrink-0 flex-col items-center justify-center gap-3 px-4 xl:w-32">
            <span className="vault-ticket-notch -top-2.5" />
            <div className="vault-qr"><QrCode className="h-14 w-14" strokeWidth={1.5} /></div>
            <span className="vault-ink-soft text-center font-mono text-[8px] font-bold uppercase tracking-[0.2em]">One pass.<br />All the feels.</span>
            <span className="vault-ticket-notch -bottom-2.5" />
          </div>
        </div>
        <div className="vault-ticket-strip flex items-center justify-between gap-4 px-5 py-2.5">
          <span className="font-comic text-xl tracking-wide">ADMIT ONE ⚡ ZERO QUEUE</span>
          <div className="vault-barcode h-7 w-20" />
        </div>
      </div>
      <div className="vault-sticker font-comic">SCAN<br />&lt;0.5s!</div>
      <div className="vault-chip vault-chip-top animate-float">
        <span className="h-2 w-2 rounded-full bg-success motion-safe:animate-ping" />
        <span className="text-primary">Gate-ready QR</span>
      </div>
      <div className="vault-chip vault-chip-bottom animate-float-delayed">
        <ShieldCheck className="h-4 w-4 text-accent" />
        <span className="text-accent">Screenshot-proof</span>
      </div>
      <div className="vault-art-caption flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-[0.2em] text-text-muted">
        <span className="flex items-center gap-2"><span className="h-px w-8 bg-primary/60" /> Made for the moment</span>
        <span className="text-primary/80">FLASHPASS / DIGITAL ACCESS</span>
      </div>
    </div>
  );
}

function RecoverySteps({ found }) {
  return (
    <div className="recovery-steps grid grid-cols-3 gap-2" aria-label="Find your booking, open your pass, show your QR at the gate">
      {[
        { number: '01', label: 'Find your booking', icon: Search },
        { number: '02', label: 'Open your pass', icon: Ticket },
        { number: '03', label: 'Show your QR', icon: QrCode }
      ].map(({ number, label, icon: Icon }, index) => (
        <div key={number} className={`recovery-step ${index === (found ? 1 : 0) ? 'recovery-step-current' : ''}`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <Icon className="h-4 w-4" />
            <span className="font-mono text-[9px] opacity-60">{number}</span>
          </div>
          <p className="text-[10px] leading-snug sm:text-[11px]">{label}</p>
        </div>
      ))}
    </div>
  );
}

export default function MyTicketPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [orderId, setOrderId] = useState('');
  const [showOrderIdField, setShowOrderIdField] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [foundPasses, setFoundPasses] = useState(null);
  const [savedDevicePass, setSavedDevicePass] = useState(null);
  const resultsHeading = useRef(null);

  useEffect(() => {
    if (foundPasses) resultsHeading.current?.focus();
  }, [foundPasses]);

  // Check if a pass was previously cached on this device
  useEffect(() => {
    document.title = 'Find My Pass — FlashPass';
    try {
      const saved = localStorage.getItem('cc_active_pass');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.orderId) {
          setSavedDevicePass(parsed);
        }
      }
    } catch (e) {}
  }, []);

  const handlePhoneChange = (e) => {
    setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
    setError('');
    setFoundPasses(null);
  };

  const handleOrderIdChange = (e) => {
    setOrderId(e.target.value.toUpperCase());
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanPhone = phone.trim();
    const cleanOrderId = orderId.trim();

    if (!cleanPhone && !cleanOrderId) {
      setError('Please enter your 10-digit registered mobile number.');
      return;
    }

    if (cleanPhone && cleanPhone.length !== 10 && !cleanOrderId) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setLoading(true);
    setError('');
    setFoundPasses(null);

    try {
      const data = await api.lookupMyTicket({
        phone: cleanPhone || undefined,
        orderId: cleanOrderId || undefined
      });

      if (data.multiple && Array.isArray(data.passes) && data.passes.length > 1) {
        // Multiple passes found for this phone number
        setFoundPasses(data.passes);
      } else if (data.orderId || data.passes?.[0]?.orderId) {
        const targetOrderId = data.orderId || data.passes[0].orderId;
        const query = cleanPhone ? `?phone=${cleanPhone}` : '';
        navigate(`/pass/${targetOrderId}${query}`);
      } else {
        setError('No active pass found. Please verify your mobile number.');
      }
    } catch (err) {
      setError(err.message || 'No active pass found for this mobile number.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pass-vault-page min-h-screen flex flex-col">
      <Header />
      <main className="relative isolate flex-1 overflow-hidden" id="pass-recovery">
        <div className="recovery-atmosphere pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
        <div className="recovery-grid pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />

        <div className="mx-auto w-full max-w-7xl px-4 pb-7 pt-6 sm:px-6 sm:pb-10 sm:pt-8 lg:px-8 lg:pb-12">
          <div className="recovery-edition mb-8 hidden items-center justify-between gap-4 border-b border-white/[0.08] pb-4 font-mono text-[9px] uppercase tracking-[0.22em] text-text-muted lg:flex">
            <span className="flex items-center gap-2"><Zap className="h-3 w-3 text-primary" /> Your world. One pass.</span>
            <span>FLASHPASS <span className="mx-3 text-white/20">/</span> THE PASS VAULT</span>
          </div>
          <div className="recovery-layout grid min-w-0 grid-cols-1 items-center gap-7 lg:grid-cols-2 lg:gap-12 xl:gap-20">
            <section className="min-w-0 text-center lg:text-left" aria-labelledby="recovery-title">
              <span className="recovery-eyebrow inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] sm:text-[10px]">
                <Sparkles className="h-3.5 w-3.5" /> Your memories have a backstage pass
              </span>
              <h1 id="recovery-title" className="recovery-headline mt-4 font-comic uppercase">
                <span className="recovery-headline-ink">Your plans.</span><br /><span className="recovery-headline-yellow">Your pass.</span><br className="hidden lg:block" /> <span className="recovery-headline-magenta">Right here.</span>
              </h1>
              <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-text-muted sm:text-base lg:mx-0">
                The event is waiting. Find your booked pass with your mobile number and get back to making memories.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[10px] text-text-muted sm:text-xs lg:justify-start">
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-info" /> No order ID needed</span>
                <span className="inline-flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5 text-primary" /> Ready on your phone</span>
              </div>
              <PassIllustration />
            </section>

            <section className="recovery-panel relative min-w-0" aria-labelledby="lookup-title">
              <div className="recovery-frame relative p-px">
                <div className="recovery-form-surface overflow-hidden">
                  <div className="recovery-form-topline flex items-center justify-between gap-3 px-4 py-3.5 sm:px-7">
                    <span className="flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-text-muted"><Ticket className="h-3.5 w-3.5 text-primary" /> The pass desk</span>
                    <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-wider text-info"><span className="h-1 w-1 rounded-full bg-info" /> DIGITAL ACCESS</span>
                  </div>
                  <div className="p-4 sm:p-7 xl:p-8">
                    <div className="mb-6 flex items-start gap-3 sm:gap-4">
                      <div className="recovery-search-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl sm:h-12 sm:w-12">
                        {foundPasses ? <Ticket className="h-5 w-5" /> : <Search className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <h2 id="lookup-title" ref={resultsHeading} tabIndex={-1} className="font-comic text-3xl tracking-wide text-white sm:text-4xl">
                          {foundPasses ? 'YOUR PASSES ARE HERE.' : 'FIND MY PASS'}
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-text-muted sm:text-sm">
                          {foundPasses ? 'Choose a pass to open your gate QR.' : 'Already booked? Let’s bring your pass back.'}
                        </p>
                      </div>
                    </div>

                    {savedDevicePass && !foundPasses && (
                      <div className="saved-device-pass mb-6 flex items-center gap-3 rounded-2xl p-3 sm:p-4">
                        <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary sm:flex"><Ticket className="h-5 w-5" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-primary">Pass on this device</p>
                          <p className="mt-1 break-words text-sm font-semibold text-white">{savedDevicePass.holderName || 'Attendee Pass'}</p>
                          <p className="mt-0.5 break-all font-mono text-[10px] text-text-muted">{savedDevicePass.orderId}</p>
                        </div>
                        <Link to={`/pass/${savedDevicePass.orderId}`} aria-label={`Open saved pass ${savedDevicePass.orderId}`} className="recovery-open inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 font-comic text-lg text-black">
                          OPEN <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    )}

                    {foundPasses ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                          <div>
                            <p className="text-sm font-semibold text-info">{foundPasses.length} active passes found</p>
                            <p className="mt-1 font-mono text-[11px] text-text-muted">{phone ? `For +91 ${phone}` : `Order: ${orderId}`}</p>
                          </div>
                          <button type="button" onClick={() => setFoundPasses(null)} className="min-h-11 text-xs font-semibold text-accent underline-offset-4 hover:underline">Search again</button>
                        </div>
                        <div className="space-y-3">
                          {foundPasses.map((pass) => (
                            <Link key={pass.orderId} to={`/pass/${pass.orderId}${phone ? `?phone=${phone}` : ''}`} className="recovered-pass group block min-w-0 rounded-2xl p-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <Ticket className="h-4 w-4 shrink-0 text-accent" />
                                <ComicBadge variant={pass.badge?.includes('VIP') ? 'magenta' : 'yellow'} className="max-w-full text-xs">{pass.badge || 'PASS'}</ComicBadge>
                              </div>
                              <h3 className="mt-3 font-comic text-2xl tracking-wide text-white">{pass.eventName || 'Live Event'}</h3>
                              <p className="mt-1 break-words text-sm text-text-muted">{pass.holderName}</p>
                              {pass.venue && <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-text-muted"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" /> {pass.venue}</p>}
                              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-border pt-3">
                                <span className="break-all font-mono text-[10px] text-text-muted">{pass.orderId}</span>
                                <span className="inline-flex items-center gap-1.5 font-comic text-lg text-primary">VIEW PASS <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
                        <div>
                          <label htmlFor="recovery-phone" className="mb-2 flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase text-text-muted">
                            <Smartphone className="h-3.5 w-3.5 text-accent" /> Registered mobile number
                          </label>
                          <div className="recovery-phone-shell flex overflow-hidden rounded-xl border border-white/15">
                            <span className="inline-flex items-center border-r border-border px-3 font-mono text-sm font-bold text-text-muted sm:px-4">+91</span>
                            <input id="recovery-phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" value={phone} onChange={handlePhoneChange} aria-describedby="phone-hint" disabled={loading} className="min-h-14 w-full bg-transparent px-3 py-3 font-mono text-base tracking-wider text-text placeholder:text-text-muted/40 focus:outline-none sm:px-4" />
                          </div>
                          <p id="phone-hint" className="mt-2 text-xs leading-relaxed text-text-muted">Use the 10-digit number entered while booking.</p>
                        </div>

                        <div>
                          <button type="button" onClick={() => setShowOrderIdField(!showOrderIdField)} aria-expanded={showOrderIdField} aria-controls="order-id-field" disabled={loading} className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-info">
                            <Hash className="h-3.5 w-3.5" /><span>Have an Order ID? <span className="font-normal">(Optional)</span></span>
                            {showOrderIdField ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                          <div id="order-id-field" hidden={!showOrderIdField} className="mt-2">
                            <label htmlFor="recovery-order" className="mb-2 block font-mono text-[11px] font-bold uppercase text-text-muted">Order ID</label>
                            <input id="recovery-order" name="orderId" type="text" autoCapitalize="characters" spellCheck={false} placeholder="e.g. CC-7K3M9QX4" value={orderId} onChange={handleOrderIdChange} aria-describedby="order-hint" disabled={loading} className="recovery-order-input min-h-12 w-full rounded-xl border border-white/15 px-3 py-3 font-mono text-base uppercase tracking-wider text-text placeholder:text-text-muted/40 focus:outline-none" />
                            <p id="order-hint" className="mt-2 text-xs leading-relaxed text-text-muted">You can also find your pass with just your Order ID.</p>
                          </div>
                        </div>

                        {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm text-pink-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

                        <ComicButton type="submit" variant="accent" size="lg" disabled={loading} className="recovery-submit w-full">
                          {loading ? <Loader2 className="mr-1 h-5 w-5 motion-safe:animate-spin" /> : <Search className="mr-1 h-5 w-5" />}
                          <span aria-live="polite">{loading ? 'SEARCHING...' : 'FIND MY PASS'}</span>
                          {!loading && <ArrowRight className="ml-auto h-5 w-5" />}
                        </ComicButton>
                      </form>
                    )}

                    <div className="mt-6 border-t border-white/10 pt-5">
                      <RecoverySteps found={Boolean(foundPasses)} />
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-8 grid min-w-0 grid-cols-1 gap-4 lg:mt-10 lg:grid-cols-2 lg:gap-6">
            <section className="recovery-support recovery-support-gold relative flex min-w-0 items-start gap-3 overflow-hidden rounded-2xl p-4 sm:gap-4 sm:p-5" aria-labelledby="gate-help-title">
              <HelpCircle className="pointer-events-none absolute -bottom-5 -right-4 h-28 w-28 -rotate-12 text-primary/[0.04]" aria-hidden="true" />
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><HelpCircle className="h-5 w-5" /></div>
              <div className="min-w-0">
                <h2 id="gate-help-title" className="font-comic text-xl tracking-wide text-primary sm:text-2xl">AT THE GATE? WE’VE GOT YOU.</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-text-muted sm:text-sm">Visit the <strong className="font-semibold text-text">Help Desk at Gate 1</strong>. Our volunteers can help find or re-issue your pass using your name and UPI payment history.</p>
              </div>
            </section>
            <section className="recovery-support recovery-support-cyan relative flex min-w-0 items-start gap-3 overflow-hidden rounded-2xl p-4 sm:gap-4 sm:p-5" aria-labelledby="explore-title">
              <Ticket className="pointer-events-none absolute -bottom-5 -right-4 h-28 w-28 -rotate-12 text-info/[0.04]" aria-hidden="true" />
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-info/25 bg-info/10 text-info"><Sparkles className="h-5 w-5" /></div>
              <div className="min-w-0">
                <h2 id="explore-title" className="font-comic text-xl tracking-wide text-white sm:text-2xl">YOUR NEXT PLAN STARTS HERE.</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-text-muted sm:text-sm">Haven’t booked yet? Find an event worth showing up for.</p>
                <Link to="/#live-events" className="mt-1 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-info hover:underline">EXPLORE LIVE EVENTS <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
