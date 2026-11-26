import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { IconTile } from '../components/landing/Premium';
import Header from '../components/common/Header';
import { stockInfo } from '../utils/stock';
import { safeGoBack } from '../utils/navigation';
import {
  ArrowLeft, ArrowRight, Lock, AlertCircle, CheckCircle, RefreshCw, ShieldCheck,
  X, Users, User, Tag, ShoppingBag, Check, Zap, HeartHandshake, Ticket, MapPin, Mail, Smartphone,
  Shirt, Coffee, Car, Crown, ChevronDown, Sparkles
} from 'lucide-react';

// Shared input look for the checkout form (border colour is added per field)
const fieldCls =
  'w-full bg-[#14142A] border-2 rounded-xl px-3.5 py-2.5 text-sm text-text placeholder-text-muted/50 ' +
  'focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(255,214,10,0.2)] transition-all';

// Add-on tile icon per catalogue category
const ADDON_ICONS = { MERCH: Shirt, FOOD: Coffee, PARKING: Car, VIP_PERK: Crown };

export default function CheckoutPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // With no ?eventId= the server sends the newest event on sale; there is no fixed default event.
  const paramEventId = searchParams.get('eventId') || '';
  const paramTier = searchParams.get('tier');
  const paramRef = searchParams.get('ref');
  // Merch 'Pre-order' links from the landing page arrive with the add-on preselected
  const paramAddOn = searchParams.get('addon');

  const [eventData, setEventData] = useState(null);
  const eventId = paramEventId || eventData?.eventId || '';
  const isKckEvent = String(eventId || '').toLowerCase().includes('comics-karnival');
  const [allEvents, setAllEvents] = useState([]);
  const [selectedTierId, setSelectedTierId] = useState(paramTier || 'general');
  const [isGroupBooking, setIsGroupBooking] = useState(false);
  const [groupSize, setGroupSize] = useState(2);

  // Attendees array: [leadAttendee, friend1, friend2, ...]
  const [attendees, setAttendees] = useState([
    { name: '', phone: '', email: '' }
  ]);

  // Add-ons selected: { [addonId]: { quantity: 1, variant: 'M' } }
  const [selectedAddOns, setSelectedAddOns] = useState({});

  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  // Affiliate state
  const [affiliateCode, setAffiliateCode] = useState(paramRef || '');

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [existingOrder, setExistingOrder] = useState(null);

  const [uploadIndexTarget, setUploadIndexTarget] = useState(0);

  // Load Event Info
  useEffect(() => {
    setSelectedAddOns({});
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');

    api.getEventInfo(paramEventId, affiliateCode)
      .then(data => {
        setEventData(data);
        document.title = 'FlashPass — High-Speed Ingress & Ticketing';
        // If paramTier is present, select it; else pick general or first
        if (paramTier && data.ticketTiers?.some(t => t.tierId === paramTier)) {
          setSelectedTierId(paramTier);
        } else if (data.ticketTiers?.length > 0) {
          const generalTier = data.ticketTiers.find(t => t.tierId === 'general');
          setSelectedTierId(generalTier ? generalTier.tierId : data.ticketTiers[0].tierId);
        } else {
          setSelectedTierId('general'); // no ticket types set up: the single General pass
        }
        const preselect = paramAddOn && data.addOns?.find(a => a.addOnId === paramAddOn);
        if (preselect && !stockInfo(preselect.inventory, preselect.soldCount).soldOut) {
          handleAddOnToggle(preselect);
        }
      })
      .catch(err => console.error('Failed to load event data:', err));

  }, [paramEventId]);

  // Load All Active Events for Multi-Event Switching
  useEffect(() => {
    api.getAllPublicEvents()
      .then(events => {
        if (Array.isArray(events)) setAllEvents(events);
      })
      .catch(() => {});
  }, []);

  // Adjust attendees array when group size or group booking toggle changes
  useEffect(() => {
    if (!isGroupBooking) {
      setAttendees(prev => [prev[0] || { name: '', phone: '', email: '' }]);
    } else {
      setAttendees(prev => {
        const next = [...prev];
        while (next.length < groupSize) {
          next.push({ name: '', phone: '', email: '' });
        }
        return next.slice(0, groupSize);
      });
    }
  }, [isGroupBooking, groupSize]);

  // Active Ticket Tier
  // With no ticket types set up by the admin, everyone buys one General pass
  // at the event's own price (the same fallback the server uses)
  const generalPass = {
    tierId: 'general',
    name: 'General Pass',
    pricePaise: eventData?.basePricePaise ?? 5000,
    platformFeePaise: eventData?.platformFeePaise ?? 200,
    badge: 'GENERAL',
    perks: ['Event entry']
  };
  const currentTier = eventData?.ticketTiers?.find(t => t.tierId === selectedTierId) || generalPass;

  // Attendee Form field change
  const handleAttendeeChange = (index, field, value) => {
    let formatted = value;
    if (field === 'name') {
      formatted = value.replace(/\b\w/g, c => c.toUpperCase());
    }
    if (field === 'phone') {
      formatted = value.replace(/\D/g, '').slice(0, 10);
    }

    setAttendees(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: formatted };
      return copy;
    });

    const key = `attendee_${index}_${field}`;
    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: '' }));
    }
  };

  // Helper to determine if an add-on is wearable/apparel that requires a size selection
  const isClothingAddon = (addon) => {
    if (Array.isArray(addon?.variants) && addon.variants.length > 0) return true;
    if (addon?.category === 'MERCH' && /(t-?shirt|tee|hoodie|jersey|apparel|jacket)/i.test(addon?.name || '')) {
      return true;
    }
    return false;
  };

  const getAddonVariants = (addon) => {
    if (Array.isArray(addon?.variants) && addon.variants.length > 0) {
      return addon.variants;
    }
    if (isClothingAddon(addon)) {
      return ['S', 'M', 'L', 'XL', 'XXL'];
    }
    return [];
  };

  // Add-ons toggles
  const handleAddOnToggle = (addon) => {
    const id = addon.addOnId || addon.addonId || addon._id;
    if (!id) return;

    const variants = getAddonVariants(addon);
    const hasVariants = variants.length > 0;
    const cleanName = isClothingAddon(addon)
      ? addon.name.replace(/\s*\(Size\s+[A-Z0-9]+\)/i, '').trim()
      : addon.name;

    setSelectedAddOns(prev => {
      const copy = { ...prev };
      if (copy[id]) {
        delete copy[id];
      } else {
        copy[id] = {
          addOnId: id,
          addonId: id,
          name: cleanName,
          unitPricePaise: addon.pricePaise,
          quantity: 1,
          variant: hasVariants ? (variants[1] || variants[0] || 'M') : undefined
        };
      }
      return copy;
    });
  };

  const updateAddOnVariant = (addonId, variant) => {
    setSelectedAddOns(prev => {
      if (!prev[addonId]) return prev;
      return {
        ...prev,
        [addonId]: { ...prev[addonId], variant }
      };
    });
  };

  // Validate Coupon
  const handleApplyCoupon = async (e) => {
    e?.preventDefault();
    if (!couponCode.trim()) return;

    setValidatingCoupon(true);
    setCouponError('');
    try {
      const currentAddOnsTotalPaise = Object.values(selectedAddOns).reduce((acc, item) => {
        return acc + (item.unitPricePaise * item.quantity);
      }, 0);
      const totalEligiblePaise = (currentTier.pricePaise * attendees.length) + currentAddOnsTotalPaise;
      const res = await api.validateCoupon(couponCode.trim(), totalEligiblePaise, eventId);
      setAppliedCoupon(res);
      setCouponError('');
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err.message || 'Invalid promo code');
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponError('');
  };

  // Calculations
  const passCount = attendees.length;
  const ticketsSubtotalPaise = currentTier.pricePaise * passCount;
  const platformFeePaise = (currentTier.platformFeePaise || 200) * passCount;

  const addOnsTotalPaise = Object.values(selectedAddOns).reduce((acc, item) => {
    return acc + (item.unitPricePaise * item.quantity);
  }, 0);

  const eligibleBasePaise = ticketsSubtotalPaise + addOnsTotalPaise;

  // Promo codes discount the tickets only, exactly as the server charges
  const discountPaise = appliedCoupon
    ? (appliedCoupon.discountType === 'PERCENT'
        ? Math.round((ticketsSubtotalPaise * (appliedCoupon.discountValue || 0)) / 100)
        : Math.min(ticketsSubtotalPaise, appliedCoupon.discountValue || appliedCoupon.discountPaise || 0))
    : 0;

  const totalAmountPaise = Math.max(0, eligibleBasePaise - discountPaise) + platformFeePaise;

  // Dynamic re-validation if order amount changes and drops below coupon minimum
  useEffect(() => {
    if (!appliedCoupon) return;
    const currentEligible = ticketsSubtotalPaise + addOnsTotalPaise;
    if (appliedCoupon.minOrderAmountPaise && currentEligible < appliedCoupon.minOrderAmountPaise) {
      const reqRupees = (appliedCoupon.minOrderAmountPaise / 100).toFixed(0);
      setAppliedCoupon(null);
      setCouponError(`Coupon ${appliedCoupon.code} removed: Min. order of ₹${reqRupees} required`);
    }
  }, [ticketsSubtotalPaise, addOnsTotalPaise, appliedCoupon]);

  const formatRupees = (paise) => (paise / 100).toFixed(2);

  // Form Validation and Submission
  const validateAll = () => {
    const errs = {};
    let firstErrorField = null;

    attendees.forEach((att, idx) => {
      if (!att.name || att.name.trim().length < 2) {
        errs[`attendee_${idx}_name`] = `Attendee #${idx + 1} name required`;
        if (!firstErrorField) firstErrorField = `attendee_${idx}_name`;
      }
      const cleanPhone = (att.phone || '').replace(/\D/g, '');
      if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
        errs[`attendee_${idx}_phone`] = `Attendee #${idx + 1} valid 10-digit mobile required`;
        if (!firstErrorField) firstErrorField = `attendee_${idx}_phone`;
      }
      const cleanEmail = (att.email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        errs[`attendee_${idx}_email`] = `Attendee #${idx + 1} valid email required`;
        if (!firstErrorField) firstErrorField = `attendee_${idx}_email`;
      }
    });

    setErrors(errs);

    if (firstErrorField) {
      setTimeout(() => {
        const el = document.getElementById(firstErrorField);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
        }
      }, 60);
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateAll()) return;

    setSubmitting(true);
    try {
      const lead = attendees[0];
      const selectedAddOnsList = Object.values(selectedAddOns);

      const payload = {
        name: lead.name,
        phone: lead.phone,
        email: lead.email || undefined,
        tierId: currentTier.tierId,
        isGroupBooking: isGroupBooking && attendees.length > 1,
        attendees: attendees.map((a, i) => ({
          name: a.name,
          phone: a.phone,
          email: a.email,
          groupIndex: i + 1
        })),
        couponCode: appliedCoupon ? appliedCoupon.code : undefined,
        selectedAddOns: selectedAddOnsList.length > 0 ? selectedAddOnsList : undefined,
        affiliateCode: affiliateCode ? affiliateCode.trim() : undefined,
        eventId
      };

      const order = await api.createOrder(payload);

      if (order.existingPass) {
        setExistingOrder(order.orderId);
        setSubmitting(false);
        return;
      }

      navigate(`/order/${order.orderId}`);
    } catch (err) {
      alert(err.message || 'Failed to create order');
      setSubmitting(false);
    }
  };

  // Only what the admin has set up and switched on is for sale
  const tiers = eventData?.ticketTiers?.length > 0 ? eventData.ticketTiers : [generalPass];
  const addOns = eventData?.addOns || [];

  const leadReady = attendees[0]?.name?.trim().length >= 2 && /^[6-9]\d{9}$/.test((attendees[0]?.phone || '').replace(/\D/g, '')) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((attendees[0]?.email || '').trim());
  const hasErrors = Object.keys(errors).some(k => Boolean(errors[k]));
  const selectedTierDetails = tiers.find(tier => tier.tierId === selectedTierId) || currentTier;

  const handleEventChange = (nextEventId) => {
    if (nextEventId === eventId) return;
    const params = new URLSearchParams({ eventId: nextEventId });
    if (paramRef) params.set('ref', paramRef);
    navigate(`/buy?${params.toString()}`);
  };

  return (
    <div className={`min-h-screen bg-bg flex flex-col ${isKckEvent ? '[&_.font-comic]:!font-display [&_.font-comic]:tracking-wider' : ''}`}>
      <Header />

      <main className="relative flex-1 overflow-hidden">
        {/* Ambient glows + halftone */}
        <div className="pointer-events-none absolute -top-40 -left-40 w-[560px] h-[520px] rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute top-[40%] -right-40 w-[560px] h-[520px] rounded-full bg-accent/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-halftone opacity-25" />

        <form onSubmit={handleSubmit} className="relative max-w-6xl mx-auto w-full px-4 py-5 sm:py-8">
          {/* ===== Page header ===== */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 mb-5 sm:mb-7">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => safeGoBack(navigate)}
                className="mt-1 p-2.5 rounded-xl bg-white/5 border-2 border-white/10 text-text hover:text-primary hover:border-primary/60 transition-all"
                title="Back to previous page"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Secure checkout</span>
                <h1 className="font-comic text-4xl sm:text-5xl text-white uppercase tracking-wide leading-none drop-shadow-[3px_3px_0_#000]">
                  Get your <span className="text-primary">pass</span>
                </h1>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono text-text-muted">
                  <span className="inline-flex items-center gap-1"><Ticket className="w-3.5 h-3.5 text-primary" /> {eventData?.name || 'Loading event…'}</span>
                  {eventData?.venue && <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-accent" /> {eventData.venue}</span>}
                </p>
              </div>
            </div>

            {/* Step progress */}
            <ol className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase">
              {[
                { label: 'Pass', done: true },
                { label: 'Details', done: leadReady },
                { label: 'Pay', done: false }
              ].map((s, i) => (
                <li key={s.label} className="flex items-center gap-1.5">
                  {i > 0 && <span className={`w-6 h-0.5 rounded-full ${s.done ? 'bg-primary' : 'bg-white/15'}`} />}
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border-2 ${
                    s.done ? 'bg-primary text-black border-black shadow-[2px_2px_0_#000]' : 'bg-white/5 text-text-muted border-white/10'
                  }`}>
                    {s.done ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>} {s.label}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
            {/* ================= LEFT: form ================= */}
            <div className="space-y-6 min-w-0">
              {/* Multi-event switcher */}
              {allEvents.length > 1 && (
                <section className="checkout-events rounded-2xl sm:rounded-3xl bg-[#0D0D1A]/90 border-2 border-white/10 p-3 sm:p-4 shadow-[4px_4px_0_#000]">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[11px] font-mono uppercase text-text-muted font-bold flex items-center gap-1.5">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      Live events ({allEvents.length})
                    </span>
                    <span className="text-[10px] font-mono text-primary font-bold">Tap to switch</span>
                  </div>
                  <div className="relative sm:hidden">
                    <label htmlFor="checkout-event" className="sr-only">Choose event</label>
                    <select
                      id="checkout-event"
                      value={eventId}
                      onChange={e => handleEventChange(e.target.value)}
                      className="w-full min-w-0 min-h-11 appearance-none rounded-xl border-2 border-primary/60 bg-[#14142A] py-2 pl-3 pr-9 text-text font-heading"
                    >
                      {!allEvents.some(ev => ev.eventId === eventId) && (
                        <option value={eventId}>{eventData?.name || 'Current event'}</option>
                      )}
                      {allEvents.map(ev => (
                        <option key={ev.eventId} value={ev.eventId}>{ev.name} · ₹{ev.basePriceRupees || '50'}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                  </div>
                  <div className="hidden sm:grid sm:grid-cols-2 gap-2.5">
                    {allEvents.map(ev => {
                      const isCurrent = ev.eventId === eventId;
                      return (
                        <button
                          key={ev.eventId}
                          type="button"
                          onClick={() => handleEventChange(ev.eventId)}
                          className={`p-3 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isCurrent
                              ? 'bg-primary/10 border-primary shadow-[3px_3px_0_#000]'
                              : 'bg-white/[0.03] border-white/10 hover:border-primary/50 hover:-translate-y-0.5'
                          }`}
                        >
                          <div className="min-w-0">
                            <span className="font-comic text-lg text-white tracking-wide truncate block leading-tight">{ev.name}</span>
                            <span className="text-[10px] font-mono text-text-muted truncate flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-accent shrink-0" /> {ev.venue?.split(',')[0] || 'Venue'}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-comic text-lg text-primary block leading-none">₹{ev.basePriceRupees || '50'}</span>
                            {isCurrent ? (
                              <span className="inline-block mt-1 text-[9px] bg-primary text-black font-mono font-bold px-1.5 py-0.5 rounded border border-black">SELECTED</span>
                            ) : (
                              <span className="inline-block mt-1 text-[9px] text-accent font-mono font-bold">SWITCH →</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Ambassador banner */}
              {affiliateCode && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-accent/20 to-primary/10 border-2 border-accent flex items-center justify-between gap-3 shadow-[4px_4px_0_#000]">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent text-white flex items-center justify-center border-2 border-black shadow-[2px_2px_0_#000] shrink-0">
                      <HeartHandshake className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-comic text-lg text-white tracking-wide block leading-tight">Ambassador invite applied</span>
                      <span className="text-[11px] font-mono text-text-muted">Referred by <span className="font-bold text-primary">@{affiliateCode}</span></span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-accent text-white font-mono text-[9px] font-bold border-2 border-black">VERIFIED</span>
                </div>
              )}

              {/* Existing pass alert */}
              {existingOrder && (
                <div className="p-4 rounded-2xl bg-primary/15 border-2 border-primary shadow-[4px_4px_0_#000] flex items-start gap-3">
                  <CheckCircle className="w-6 h-6 text-primary shrink-0" />
                  <div>
                    <p className="font-comic text-xl text-primary tracking-wide leading-tight">This number already has an active pass!</p>
                    <p className="text-xs font-mono text-text-muted mt-0.5">Order ID: {existingOrder}</p>
                    <Link
                      to={`/pass/${existingOrder}`}
                      className="mt-2 inline-flex items-center gap-1 font-comic text-lg bg-primary text-black px-4 py-1.5 rounded-xl border-2 border-black shadow-[2px_2px_0_#000]"
                    >
                      View my pass <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              )}

              {/* ===== 1. Tier selector ===== */}
              <section id="checkout-passes">
                <StepHeading n={1} a="#FFD60A" b="#FB923C" icon={Zap} title="Choose your pass" sub="Every pass is instant and works offline" />
                <div className="checkout-tier-grid grid grid-cols-2 sm:grid-cols-3 auto-rows-fr gap-3">
                  {tiers.map((tier, tIdx) => {
                    const isSelected = selectedTierId === tier.tierId;
                    const isFeatured = Boolean(tier.featured); // admin marks one as "Popular"
                    const color = isFeatured ? '#FFD60A' : ['#22D3EE', '#FFD60A', '#FF2E88'][tIdx % 3];
                    return (
                      <button
                        key={tier.tierId}
                        type="button"
                        aria-pressed={isSelected}
                        data-tier-id={tier.tierId}
                        onClick={() => setSelectedTierId(tier.tierId)}
                        className={`relative min-w-0 text-left rounded-2xl p-[2px] transition-all duration-200 cursor-pointer ${isSelected ? 'sm:-translate-y-1' : 'hover:-translate-y-0.5'}`}
                        style={{
                          background: isSelected ? `linear-gradient(135deg, ${color}, #FF2E88)` : 'rgba(255,255,255,0.1)',
                          boxShadow: isSelected ? `0 0 28px ${color}40, 4px 4px 0 #000` : '4px 4px 0 #000'
                        }}
                      >
                        {isFeatured && (
                          <span className="absolute -top-2.5 right-3 z-10 px-2 py-0.5 bg-accent text-white text-[9px] font-mono font-bold rounded-full border-2 border-black">
                            POPULAR
                          </span>
                        )}
                        <div className="relative h-full rounded-[14px] bg-[#0F0F1F] p-3 sm:p-4 overflow-hidden flex flex-col">
                          <div className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
                          <div className="flex items-start justify-between gap-2">
                            <span
                              className="min-w-0 px-1.5 py-0.5 rounded-md font-mono text-[9px] font-bold border-2 border-black text-black [overflow-wrap:anywhere]"
                              style={{ background: color }}
                            >
                              {(tier.badge || 'PASS').replace(/_/g, ' ')}
                            </span>
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-black' : 'border-white/25'}`} style={isSelected ? { background: color } : undefined}>
                              {isSelected && <Check className="w-3 h-3 text-black" />}
                            </span>
                          </div>
                          <div className="mt-2 sm:mt-2.5 font-comic text-base min-[380px]:text-lg text-white leading-tight tracking-wide [overflow-wrap:anywhere]">{tier.name}</div>
                          <div className="mt-auto pt-2 sm:pt-1">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <div className="font-comic text-3xl leading-none [overflow-wrap:anywhere]" style={{ color }}>₹{formatRupees((tier.pricePaise || 0) + (tier.platformFeePaise ?? 200))}</div>
                              <span className="text-[11px] font-mono text-text-muted">(with fee)</span>
                            </div>
                          </div>
                          <ul className="hidden sm:block mt-3 space-y-1">
                            {(tier.perks?.length ? tier.perks : ['Standard Entry']).slice(0, 3).map((perk) => (
                              <li key={perk} className="flex items-start gap-1.5 text-[11px] text-text-muted leading-snug">
                                <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" style={{ color }} /> {perk}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="checkout-selected-perks sm:hidden mt-3 rounded-2xl border border-info/30 bg-info/5 p-3" aria-live="polite" aria-atomic="true">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-info" />
                    <div className="min-w-0">
                      <span className="block font-mono text-[9px] uppercase tracking-wider text-info">Selected pass includes</span>
                      <h3 className="font-comic text-lg text-white leading-tight">{selectedTierDetails.name}</h3>
                    </div>
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {(selectedTierDetails.perks?.length ? selectedTierDetails.perks : ['Standard Entry']).map((perk, index) => (
                      <li key={`${index}-${perk}`} className="flex items-start gap-2 text-xs text-text-muted leading-relaxed">
                        <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-info" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              {/* ===== 2. Group booking ===== */}
              {/* Stands out on purpose: booking for a group in one go is easy to miss otherwise. */}
              <section className="relative mt-3">
                {/* Glow behind the card, stronger once switched on */}
                <div
                  className={`absolute -inset-1 rounded-[1.75rem] blur-xl transition-opacity duration-500 ${isGroupBooking ? 'opacity-60' : 'opacity-35 motion-safe:animate-pulse'}`}
                  style={{ background: 'linear-gradient(110deg, #FF2E88, #FFD60A, #22D3EE)' }}
                  aria-hidden="true"
                />
                <div className="relative rounded-3xl p-[2px] shadow-[5px_5px_0_#000]" style={{ background: 'linear-gradient(110deg, #FF2E88, #FFD60A 55%, #22D3EE)' }}>
                  <div className="relative rounded-[calc(1.5rem-2px)] overflow-hidden p-4 sm:p-5" style={{ background: isGroupBooking ? 'linear-gradient(135deg, #2A0F22, #14102A 60%, #0D0D1A)' : 'linear-gradient(135deg, #1C0F1E, #0D0D1A 65%)' }}>
                    <div className="absolute inset-0 bg-halftone opacity-25 pointer-events-none" aria-hidden="true" />

                    {/* Sticker */}
                    <span className="absolute top-0 right-4 sm:right-5 -translate-y-px inline-flex items-center gap-1 rounded-b-lg border-2 border-t-0 border-black bg-primary px-2.5 py-0.5 font-comic text-xs tracking-wider text-black">
                      <Sparkles className="w-3 h-3" /> SQUAD DEAL
                    </span>

                    {/* The whole row switches group booking on and off */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isGroupBooking}
                      aria-label="Group booking: book passes for friends in one order"
                      onClick={() => setIsGroupBooking(!isGroupBooking)}
                      className="relative w-full flex items-center gap-3 sm:gap-4 text-left cursor-pointer"
                    >
                      {/* Avatar stack */}
                      <span className="relative shrink-0 w-14 h-12 sm:w-16 sm:h-14" aria-hidden="true">
                        {[['#FF2E88', 'left-0 top-1'], ['#FFD60A', 'left-4 sm:left-5 top-0'], ['#22D3EE', 'left-8 sm:left-9 top-2']].map(([color, pos], i) => (
                          <span key={i} className={`absolute ${pos} grid place-items-center w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 border-black shadow-[2px_2px_0_#000]`} style={{ background: color }}>
                            <User className="w-4 h-4 text-black" />
                          </span>
                        ))}
                      </span>

                      <span className="min-w-0 flex-1 pt-2 sm:pt-1">
                        <span className="block font-comic text-2xl sm:text-3xl leading-none tracking-wide bg-gradient-to-r from-accent via-primary to-info bg-clip-text text-transparent drop-shadow-[2px_2px_0_#000]">
                          Coming with friends?
                        </span>
                        <span className="mt-1.5 block text-xs sm:text-[13px] text-white/80 leading-snug">
                          Book <strong className="text-primary">up to 8 passes</strong> in one order. Everyone gets their <strong className="text-info">own QR pass</strong>.
                        </span>
                      </span>

                      {/* Toggle */}
                      <span
                        className={`relative shrink-0 w-[4.25rem] h-9 rounded-full border-2 border-black shadow-[3px_3px_0_#000] transition-colors ${isGroupBooking ? 'bg-accent' : 'bg-white/10'}`}
                        aria-hidden="true"
                      >
                        <span className={`absolute inset-y-0 grid place-items-center font-mono text-[9px] font-bold ${isGroupBooking ? 'left-2 text-white' : 'right-2 text-white/60'}`}>{isGroupBooking ? 'ON' : 'OFF'}</span>
                        <span className={`absolute top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white border-2 border-black transition-all ${isGroupBooking ? 'left-[calc(100%-1.95rem)]' : 'left-0.5'}`} />
                      </span>
                    </button>

                    {!isGroupBooking && (
                      <p className="relative mt-3 pl-[4.25rem] sm:pl-20 font-mono text-[10px] font-bold uppercase tracking-wider text-primary">
                        Tap to add your squad →
                      </p>
                    )}

                {isGroupBooking && (
                  <div className="relative mt-4 pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-xs font-mono text-text-muted font-bold uppercase block">How many tickets?</span>
                      <span className="text-[10px] font-mono text-primary font-bold">Every person gets their own distinct QR code for gate entry</span>
                    </div>
                    <div className="w-full sm:w-auto grid grid-cols-7 sm:flex gap-1.5 sm:gap-2">
                      {[2, 3, 4, 5, 6, 7, 8].map(num => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setGroupSize(num)}
                          className={`w-full aspect-square sm:w-11 sm:h-11 sm:aspect-auto rounded-xl font-comic text-lg sm:text-xl border-2 border-black flex items-center justify-center transition-all cursor-pointer ${
                            groupSize === num
                              ? 'bg-primary text-black shadow-[3px_3px_0_#000] -translate-y-0.5'
                              : 'bg-white/5 text-text hover:bg-white/10'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                  </div>
                </div>
              </section>

              {/* ===== 3. Attendees ===== */}
              <section>
                <StepHeading n={2} a="#FF2E88" b="#22D3EE" icon={User} title="Who's coming" sub="Name & mobile go on the pass — used to recover it later" />
                <div className="space-y-4">
                  {attendees.map((att, idx) => {
                    const isLead = idx === 0;
                    const a = isLead ? '#FFD60A' : '#FF2E88';

                    return (
                      <div key={idx} className="relative rounded-3xl p-[2px] shadow-[6px_6px_0_#000]" style={{ background: `linear-gradient(135deg, ${a}, ${isLead ? '#FB923C' : '#22D3EE'} 70%)` }}>
                        <div className="relative rounded-[calc(1.5rem-2px)] bg-[#0D0D1A] overflow-hidden">
                          <div className="absolute inset-0 opacity-[0.12] pointer-events-none" style={{ background: `radial-gradient(circle at 0% 0%, ${a}, transparent 55%)` }} />
                          <div className="relative p-5 sm:p-6 space-y-4">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center border-2 border-black shadow-[2px_2px_0_#000] font-comic text-xl text-black" style={{ background: a }}>
                                  {idx + 1}
                                </div>
                                <div>
                                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: a }}>
                                    {isLead ? 'Lead ticket' : 'Friend pass'}
                                  </span>
                                  <div className="font-comic text-xl text-white tracking-wide leading-none">
                                    {att.name?.trim() || `Attendee #${idx + 1}`}
                                  </div>
                                </div>
                              </div>
                              <span className="px-2.5 py-1 rounded-full font-comic text-sm tracking-wide border-2 border-black text-black shadow-[2px_2px_0_#000]" style={{ background: a }}>
                                {currentTier.badge || 'PASS'}
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {/* Name */}
                              <div>
                                <label htmlFor={`attendee_${idx}_name`} className="block text-[10px] font-mono uppercase tracking-wider text-text-muted mb-1.5 font-bold">
                                  Full name <span style={{ color: a }}>*</span>
                                </label>
                                <div className="relative">
                                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                                  <input
                                    id={`attendee_${idx}_name`}
                                    type="text"
                                    autoComplete={isLead ? 'name' : 'off'}
                                    placeholder={isLead ? 'e.g. Sourav Mukherjee' : `Friend #${idx + 1} name`}
                                    maxLength={60}
                                    value={att.name}
                                    onChange={(e) => handleAttendeeChange(idx, 'name', e.target.value)}
                                    className={`${fieldCls} pl-10 ${errors[`attendee_${idx}_name`] ? 'border-danger ring-2 ring-danger/40' : 'border-white/10'}`}
                                  />
                                </div>
                                {errors[`attendee_${idx}_name`] && (
                                  <p className="text-xs text-danger mt-1 font-mono flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5" /> {errors[`attendee_${idx}_name`]}
                                  </p>
                                )}
                              </div>

                              {/* Phone */}
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label htmlFor={`attendee_${idx}_phone`} className="block text-[10px] font-mono uppercase tracking-wider text-text-muted font-bold">
                                    Mobile number <span style={{ color: a }}>*</span>
                                  </label>
                                  {!isLead && attendees[0]?.phone && (
                                    <button
                                      type="button"
                                      onClick={() => handleAttendeeChange(idx, 'phone', attendees[0].phone)}
                                      className="text-[10px] font-mono text-primary hover:underline font-bold"
                                      title="Copy lead phone number to this attendee"
                                    >
                                      Use Lead Mobile
                                    </button>
                                  )}
                                </div>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-text-muted pointer-events-none">+91</span>
                                  <input
                                    id={`attendee_${idx}_phone`}
                                    type="tel"
                                    inputMode="numeric"
                                    autoComplete={isLead ? 'tel-national' : 'off'}
                                    placeholder="98765 43210"
                                    value={att.phone}
                                    onChange={(e) => handleAttendeeChange(idx, 'phone', e.target.value)}
                                    className={`${fieldCls} pl-12 font-mono tracking-wider ${errors[`attendee_${idx}_phone`] ? 'border-danger ring-2 ring-danger/40' : 'border-white/10'}`}
                                  />
                                </div>
                                {errors[`attendee_${idx}_phone`] && (
                                  <p className="text-xs text-danger mt-1 font-mono flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5" /> {errors[`attendee_${idx}_phone`]}
                                  </p>
                                )}
                              </div>

                              {/* Email (mandatory for every attendee) */}
                              <div className="sm:col-span-2">
                                <div className="flex justify-between items-center mb-1.5">
                                  <label htmlFor={`attendee_${idx}_email`} className="block text-[10px] font-mono uppercase tracking-wider text-text-muted font-bold">
                                    Email address <span style={{ color: a }}>*</span>
                                  </label>
                                  {isLead ? (
                                    <span className="text-[10px] text-info font-mono">Pass &amp; receipt sent here</span>
                                  ) : attendees[0]?.email ? (
                                    <button
                                      type="button"
                                      onClick={() => handleAttendeeChange(idx, 'email', attendees[0].email)}
                                      className="text-[10px] font-mono text-primary hover:underline font-bold"
                                      title="Copy lead email to this attendee"
                                    >
                                      Use Lead Email
                                    </button>
                                  ) : null}
                                </div>
                                <div className="relative">
                                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                                  <input
                                    id={`attendee_${idx}_email`}
                                    type="email"
                                    required
                                    autoComplete={isLead ? 'email' : 'off'}
                                    placeholder="you@email.com"
                                    value={att.email}
                                    onChange={(e) => handleAttendeeChange(idx, 'email', e.target.value)}
                                    className={`${fieldCls} pl-10 ${errors[`attendee_${idx}_email`] ? 'border-danger ring-2 ring-danger/40' : 'border-white/10'}`}
                                  />
                                </div>
                                {errors[`attendee_${idx}_email`] && (
                                  <p className="text-xs text-danger mt-1 font-mono flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5" /> {errors[`attendee_${idx}_email`]}
                                  </p>
                                )}
                              </div>
                            </div>

                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </section>

              {/* ===== 4. Add-ons (only when the admin has set some up) ===== */}
              {addOns.length > 0 && (
              <section>
                <StepHeading n={3} a="#22D3EE" b="#16A34A" icon={ShoppingBag} title="Add extras" sub="Pre-order now, pick up at the gate with your pass QR" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {addOns.map(addon => {
                    const id = addon.addOnId || addon.addonId || addon._id;
                    const isChecked = Boolean(selectedAddOns[id]);
                    const currentSelected = selectedAddOns[id];
                    const variants = getAddonVariants(addon);
                    const showSizeSelector = isChecked && variants.length > 0;
                    const displayName = isClothingAddon(addon)
                      ? addon.name.replace(/\s*\(Size\s+[A-Z0-9]+\)/i, '').trim()
                      : addon.name;
                    const AddonIcon = ADDON_ICONS[addon.category] || ShoppingBag;
                    const stock = stockInfo(addon.inventory, addon.soldCount);
                    const toggle = () => { if (!stock.soldOut || isChecked) handleAddOnToggle(addon); };

                    return (
                      <div
                        key={id}
                        role="checkbox"
                        aria-checked={isChecked}
                        aria-disabled={stock.soldOut}
                        tabIndex={0}
                        onClick={toggle}
                        onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } }}
                        className={`relative p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col gap-3 shadow-[4px_4px_0_#000] ${
                          isChecked ? 'bg-info/10 border-info -translate-y-0.5' : stock.soldOut ? 'bg-[#0D0D1A]/90 border-white/10 opacity-50 !cursor-not-allowed' : 'bg-[#0D0D1A]/90 border-white/10 hover:border-white/30'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center border-2 border-black shrink-0 ${isChecked ? 'bg-info text-black' : 'bg-white/5 text-info'}`}>
                            <AddonIcon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-white leading-snug">{displayName}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="font-comic text-xl text-primary leading-none">₹{formatRupees(addon.pricePaise)}</span>
                              {(stock.low || stock.soldOut) && (
                                <span className={`font-mono text-[9px] font-bold uppercase ${stock.soldOut ? 'text-text-muted' : 'text-danger'}`}>
                                  {stock.soldOut ? 'Sold out' : `Only ${stock.left} left`}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 ${isChecked ? 'bg-info border-black' : 'border-white/25'}`}>
                            {isChecked && <Check className="w-4 h-4 text-black" />}
                          </span>
                        </div>

                        {showSizeSelector && (
                          <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
                            <span className="text-[10px] font-mono text-text-muted font-bold uppercase mr-1">Size</span>
                            {variants.map(v => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => updateAddOnVariant(id, v)}
                                className={`min-w-[36px] h-8 px-2 rounded-lg font-mono text-xs font-bold border-2 transition-all cursor-pointer ${
                                  (currentSelected?.variant || 'M') === v ? 'bg-primary text-black border-black shadow-[2px_2px_0_#000]' : 'bg-white/5 text-text border-white/10 hover:border-white/30'
                                }`}
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
              )}

              {/* ===== 5. Promo code (disabled for KCK) ===== */}
              {!isKckEvent && (
              <section className="rounded-3xl bg-[#0D0D1A]/90 border-2 border-white/10 p-4 sm:p-5 shadow-[4px_4px_0_#000]">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="w-4 h-4 text-accent" />
                  <span className="font-comic text-xl text-white tracking-wide">Have a promo code?</span>
                </div>

                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-success/15 border-2 border-dashed border-success p-3 rounded-2xl">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-success text-black flex items-center justify-center border-2 border-black">
                        <CheckCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="font-mono text-sm font-bold text-success block">{appliedCoupon.code} applied!</span>
                        <span className="text-[11px] font-mono text-text-muted">You save ₹{formatRupees(discountPaise)}</span>
                      </div>
                    </div>
                    <button type="button" onClick={handleRemoveCoupon} className="text-xs font-mono text-danger hover:underline font-bold p-1 cursor-pointer">
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="ENTER CODE"
                      value={couponCode}
                      onChange={(e) => {
                        setCouponCode(e.target.value.toUpperCase());
                        setCouponError('');
                      }}
                      className={`${fieldCls} border-white/10 font-mono uppercase tracking-[0.2em]`}
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={validatingCoupon || !couponCode.trim()}
                      className="px-5 rounded-xl bg-accent text-white font-comic text-lg tracking-wide border-2 border-black shadow-[3px_3px_0_#000] hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:hover:translate-y-0 cursor-pointer"
                    >
                      {validatingCoupon ? '...' : 'Apply'}
                    </button>
                  </div>
                )}

                {couponError && (
                  <p className="text-xs text-danger mt-2 font-mono flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {couponError}
                  </p>
                )}
              </section>
              )}
            </div>

            {/* ================= RIGHT: receipt (sticky on desktop) ================= */}
            <aside className="min-w-0 xl:sticky lg:top-24 space-y-4">
              <div className="relative rounded-3xl p-[2px] shadow-[8px_8px_0_#000]" style={{ background: 'linear-gradient(160deg, #FFD60A, #FF2E88 55%, #22D3EE)' }}>
                <div className="absolute -inset-2 rounded-[2rem] blur-2xl opacity-25 -z-10" style={{ background: 'linear-gradient(160deg, #FFD60A, #FF2E88)' }} />
                <div className="relative rounded-[calc(1.5rem-2px)] bg-[#0D0D1A] overflow-hidden">
                  {/* Receipt header */}
                  <div className="relative p-5 overflow-hidden">
                    <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(circle at 100% 0%, #FFD60A, transparent 60%)' }} />
                    <div className="absolute inset-0 bg-halftone opacity-30" />
                    <div className="relative">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Order summary</span>
                      <div className="font-comic text-2xl text-white tracking-wide leading-tight truncate">{eventData?.name || 'Loading event…'}</div>
                      <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary text-black border-2 border-black font-mono text-[10px] font-bold">
                        <Ticket className="w-3.5 h-3.5" /> {passCount} × {currentTier.name}
                      </div>
                    </div>
                  </div>

                  {/* Perforation */}
                  <div className="relative h-0 border-t-2 border-dashed border-white/15">
                    <span className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-bg" />
                    <span className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-bg" />
                  </div>

                  {/* Line items */}
                  <div className="p-5 space-y-2.5 font-mono text-xs">
                    <div className="flex justify-between gap-3 text-text">
                      <span className="text-text-muted">{currentTier.name} × {passCount}</span>
                      <span>₹{formatRupees(ticketsSubtotalPaise)}</span>
                    </div>
                    {addOnsTotalPaise > 0 && (
                      <div className="flex justify-between gap-3 text-text">
                        <span className="text-text-muted">Merch & add-ons</span>
                        <span>₹{formatRupees(addOnsTotalPaise)}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-3 text-text">
                      <span className="text-text-muted">Platform convenience fee</span>
                      <span>₹{formatRupees(platformFeePaise)}</span>
                    </div>
                    {discountPaise > 0 && (
                      <div className="flex justify-between gap-3 text-success font-bold">
                        <span>Promo ({appliedCoupon?.code})</span>
                        <span>-₹{formatRupees(discountPaise)}</span>
                      </div>
                    )}

                    <div className="pt-3 mt-1 border-t-2 border-dashed border-white/10 flex justify-between items-end">
                      <span className="text-text font-bold text-sm uppercase">Total</span>
                      <span className="font-comic text-5xl leading-none text-primary drop-shadow-[3px_3px_0_#000]">
                        ₹{formatRupees(totalAmountPaise)}
                      </span>
                    </div>
                  </div>

                  <div className="px-5 pb-5 space-y-3">
                    {hasErrors && (
                      <button
                        type="button"
                        onClick={() => {
                          const firstErr = Object.keys(errors).find(k => Boolean(errors[k]));
                          if (firstErr) {
                            const el = document.getElementById(firstErr);
                            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            el?.focus();
                          }
                        }}
                        className="w-full bg-danger/15 border-2 border-danger text-danger rounded-xl p-2.5 font-mono text-xs font-bold flex items-center justify-center gap-2 hover:bg-danger/25 transition-all cursor-pointer"
                      >
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        Fill the required details (tap to go)
                      </button>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="group relative w-full overflow-hidden inline-flex items-center justify-center gap-2 py-4 rounded-2xl bg-primary text-black font-comic text-2xl tracking-wide border-2 border-black shadow-[5px_5px_0_#000] hover:-translate-y-0.5 hover:shadow-[6px_7px_0_#000] active:translate-y-0.5 active:shadow-[2px_2px_0_#000] transition-all disabled:opacity-60 disabled:pointer-events-none cursor-pointer"
                    >
                      <span className="absolute inset-y-0 -left-1/2 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent skew-x-12 group-hover:left-[120%] transition-all duration-700" />
                      {submitting ? (
                        <><RefreshCw className="w-5 h-5 animate-spin" /> Preparing checkout…</>
                      ) : (
                        <><Lock className="w-5 h-5" /> Pay ₹{formatRupees(totalAmountPaise)} via {({
                          RAZORPAY: 'Razorpay',
                          CASHFREE: 'Cashfree',
                          PHONEPE: 'PhonePe',
                          STRIPE: 'Stripe',
                          PAYU: 'PayU'
                        })[(eventData?.paymentGateway?.provider || 'PAYU').toUpperCase()] || 'PayU'}</>
                      )}
                    </button>

                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {[
                        { icon: Zap, label: 'Instant pass', c: 'text-primary' },
                        { icon: Smartphone, label: 'No app needed', c: 'text-info' },
                        { icon: ShieldCheck, label: 'Anti-fraud QR', c: 'text-success' }
                      ].map(({ icon: Icon, label, c }) => (
                        <div key={label} className="rounded-xl bg-white/[0.04] border border-white/10 py-2 text-center">
                          <Icon className={`w-4 h-4 mx-auto ${c}`} />
                          <span className="block mt-1 text-[9px] font-mono font-bold uppercase text-text-muted">{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <p className="text-center text-[11px] font-mono text-text-muted flex items-center justify-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-info" /> Secure {({
                  RAZORPAY: 'Razorpay',
                  CASHFREE: 'Cashfree',
                  PHONEPE: 'PhonePe',
                  STRIPE: 'Stripe',
                  PAYU: 'PayU'
                })[(eventData?.paymentGateway?.provider || 'PAYU').toUpperCase()] || 'Payment'} Gateway (UPI, Cards, NetBanking) • Pass delivered instantly
              </p>
            </aside>
          </div>
        </form>
      </main>
    </div>
  );
}

// Numbered section heading used down the checkout form
function StepHeading({ n, a, b, icon: Icon, title, sub }) {
  return (
    <div className="flex items-center gap-3 mb-3.5">
      <div className="relative">
        <IconTile icon={Icon} a={a} b={b} size="sm" />
        <span className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-white text-black font-mono text-[10px] font-bold flex items-center justify-center border-2 border-black">
          {n}
        </span>
      </div>
      <div>
        <h2 className="font-comic text-2xl text-white uppercase tracking-wide leading-none">{title}</h2>
        {sub && <p className="text-[11px] font-mono text-text-muted mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
