import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { initSocket, joinRoom } from '../services/socket';
import confetti from 'canvas-confetti';
import ComicButton from '../components/common/ComicButton';
import Header from '../components/common/Header';
import { trackEvent } from '../utils/analytics';
import {
  Loader2, Copy, Check, Sparkles, AlertTriangle, ArrowLeft,
  ExternalLink, ShieldCheck, CreditCard, RefreshCw, Lock, Clock,
  Ticket, MapPin, Calendar, Smartphone, Zap, QrCode, Shield, User,
  Users, CheckCircle2, ChevronRight, HelpCircle
} from 'lucide-react';

// Simulated payments are offered only on the local Vite dev server. A production
// build never shows them (and the server refuses them there anyway).
const DEV_PAYMENTS = import.meta.env.DEV;

export default function PaymentConfirmingPage() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [copied, setCopied] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [orderData, setOrderData] = useState(null);
  const [launchingPayU, setLaunchingPayU] = useState(false);

  // 10-minute pass reservation hold countdown (Standard ticketing best-practice)
  const [timeLeft, setTimeLeft] = useState(594); // 09:54

  // URL query params from PayU redirect
  const payuFlag = searchParams.get('payu');
  const payuMsg = searchParams.get('msg');

  // Socket push and polling can both report PAID; only count the purchase once
  const purchaseTracked = useRef(false);

  useEffect(() => {
    document.title = 'Complete Payment — FlashPass';

    // 1. Setup Socket.io listener
    const socket = initSocket();
    joinRoom(`order:${orderId}`);

    const handleSocketStatus = (data) => {
      if (data.status === 'PAID') {
        handleSuccess(data.pass);
      }
    };

    socket.on('order:status', handleSocketStatus);

    // Initial fetch
    const fetchStatus = async () => {
      try {
        const res = await api.getOrderStatus(orderId);
        setOrderData(res);
        if (res.status === 'PAID' && res.pass) {
          handleSuccess(res.pass);
        }
      } catch (err) {
        console.error('Failed to fetch initial order status:', err);
      }
    };
    fetchStatus();

    // 2. Poll every 2.5 seconds
    const interval = setInterval(async () => {
      setPollCount(prev => prev + 1);
      try {
        const res = await api.getOrderStatus(orderId);
        setOrderData(res);
        if (res.status === 'PAID' && res.pass) {
          clearInterval(interval);
          handleSuccess(res.pass);
        }
      } catch (err) {
        console.error('Polling error', err);
      }
    }, 2500);

    // 3. Countdown timer
    const countdown = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(countdown);
      socket.off('order:status', handleSocketStatus);
    };
  }, [orderId]);

  const handleSuccess = (passData) => {
    if (!purchaseTracked.current) {
      purchaseTracked.current = true;
      trackEvent('purchase', { transaction_id: orderId, currency: 'INR' });
    }

    // Store in localStorage for fast PWA offline recovery
    try {
      localStorage.setItem('cc_active_pass', JSON.stringify({
        orderId: passData.orderId,
        holderName: passData.holderName,
        badge: passData.badge
      }));
    } catch (e) {}

    // Celebratory POW! burst
    confetti({
      particleCount: 140,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#FFD60A', '#FF2E88', '#22D3EE', '#16A34A', '#FFFFFF']
    });

    // Flip to pass page after 600ms
    setTimeout(() => {
      navigate(`/pass/${orderId}`);
    }, 600);
  };

  const handleCopyOrderId = () => {
    navigator.clipboard.writeText(orderId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePayWithPayU = () => {
    if (!orderData?.payu?.actionUrl || !orderData?.payu?.params) {
      alert('PayU payment parameters are still loading. Please wait a moment.');
      return;
    }

    setLaunchingPayU(true);
    setTimeout(() => {
      setLaunchingPayU(false);
    }, 6000);
    const { actionUrl, params } = orderData.payu;

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = actionUrl;
    form.style.display = 'none';

    Object.entries(params).forEach(([key, val]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = val !== null && val !== undefined ? String(val) : '';
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  };

  const handleLaunchPayment = async () => {
    const gw = orderData?.gateway || {};
    const provider = (gw.provider || (orderData?.payu ? 'PAYU' : 'PAYU')).toUpperCase();

    if (provider === 'PAYU') {
      handlePayWithPayU();
      return;
    }

    if (provider === 'RAZORPAY') {
      setLaunchingPayU(true);
      try {
        if (!window.Razorpay) {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.async = true;
          document.body.appendChild(script);
          await new Promise((resolve) => { script.onload = resolve; script.onerror = resolve; });
        }

        if (window.Razorpay && gw.keyId) {
          const options = {
            key: gw.keyId,
            amount: gw.amountPaise || orderData?.amountPaise || 5200,
            currency: gw.currency || 'INR',
            name: gw.eventName || orderData?.event?.name || 'FlashPass Ingress',
            description: gw.description || `Pass for ${orderData?.holderName || 'Attendee'}`,
            prefill: gw.prefill || {
              name: orderData?.holderName,
              email: orderData?.email,
              contact: orderData?.phone
            },
            theme: { color: '#FFD60A' },
            handler: async function (response) {
              try {
                const res = await api.verifyGatewayPayment(orderId, {
                  provider: 'RAZORPAY',
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_signature: response.razorpay_signature
                });
                if (res.pass) handleSuccess(res.pass);
              } catch (err) {
                alert(err.message || 'Razorpay payment verification failed');
              }
            }
          };

          const rzp = new window.Razorpay(options);

          rzp.on('payment.failed', function (response) {
            console.warn('Razorpay payment failed:', response.error);
            const isPlaceholderKey = !gw.keyId || gw.keyId.includes('YGY_9999') || gw.keyId.includes('comicscarnival') || gw.keyId.includes('mock');
            if (isPlaceholderKey && DEV_PAYMENTS) {
              const confirmSimulate = window.confirm(
                'Notice: Razorpay rejected "' + gw.keyId + '" because it is a placeholder/unregistered test key.\n\nTo see real live UPI QR & Cards popup, add your actual Key ID from dashboard.razorpay.com in Admin Portal.\n\nWould you like to simulate instant payment approval to unlock your pass right now?'
              );
              if (confirmSimulate) {
                api.verifyGatewayPayment(orderId, { provider: 'RAZORPAY' })
                  .then(res => { if (res.pass) handleSuccess(res.pass); })
                  .catch(err => alert(err.message || 'Payment simulation failed'));
              }
            } else {
              alert(`Payment Failed: ${response.error?.description || response.error?.reason || 'Payment could not be completed'}`);
            }
          });

          rzp.open();
          setLaunchingPayU(false);
          return;
        }

        // Razorpay checkout could not load: only local development may simulate it
        if (!DEV_PAYMENTS) {
          alert('Payment could not start. Please check your internet connection and try again.');
          return;
        }
        const res = await api.verifyGatewayPayment(orderId, { provider: 'RAZORPAY' });
        if (res.pass) handleSuccess(res.pass);
      } catch (err) {
        alert(err.message || 'Razorpay checkout failed');
      } finally {
        setLaunchingPayU(false);
      }
      return;
    }

    if (provider === 'PHONEPE') {
      setLaunchingPayU(true);
      try {
        const res = await api.verifyGatewayPayment(orderId, { provider: 'PHONEPE' });
        if (res.pass) handleSuccess(res.pass);
      } catch (err) {
        alert(err.message || 'PhonePe payment failed');
      } finally {
        setLaunchingPayU(false);
      }
      return;
    }

    if (provider === 'CASHFREE') {
      setLaunchingPayU(true);
      try {
        const res = await api.verifyGatewayPayment(orderId, { provider: 'CASHFREE' });
        if (res.pass) handleSuccess(res.pass);
      } catch (err) {
        alert(err.message || 'Cashfree payment failed');
      } finally {
        setLaunchingPayU(false);
      }
      return;
    }

    if (provider === 'STRIPE') {
      setLaunchingPayU(true);
      try {
        const res = await api.verifyGatewayPayment(orderId, { provider: 'STRIPE' });
        if (res.pass) handleSuccess(res.pass);
      } catch (err) {
        alert(err.message || 'Stripe payment failed');
      } finally {
        setLaunchingPayU(false);
      }
      return;
    }

    handlePayWithPayU();
  };

  const handleSimulatePayment = async () => {
    setSimulating(true);
    try {
      const res = await api.mockPayOrder(orderId);
      handleSuccess(res.pass);
    } catch (err) {
      alert(err.message || 'Payment simulation failed');
      setSimulating(false);
    }
  };

  const isPaid = orderData?.status === 'PAID';
  const amountDisplay = orderData?.amountRupees || (orderData?.amountPaise ? (orderData.amountPaise / 100).toFixed(2) : '52.00');

  const gwProvider = ((orderData?.gateway?.provider || (orderData?.payu ? 'PAYU' : 'PAYU'))).toUpperCase();
  const gwTitle = {
    RAZORPAY: 'RAZORPAY SECURE CHECKOUT',
    PAYU: 'PAYU HOSTED CHECKOUT',
    PHONEPE: 'PHONEPE (UPI / QR / APP)',
    CASHFREE: 'CASHFREE FAST CHECKOUT',
    STRIPE: 'STRIPE GLOBAL CHECKOUT'
  }[gwProvider] || `${gwProvider} CHECKOUT`;

  const gwButtonText = {
    RAZORPAY: `PAY ₹${amountDisplay} VIA RAZORPAY`,
    PAYU: `PAY ₹${amountDisplay} VIA PAYU`,
    PHONEPE: `PAY ₹${amountDisplay} VIA PHONEPE`,
    CASHFREE: `PAY ₹${amountDisplay} VIA CASHFREE`,
    STRIPE: `PAY ₹${amountDisplay} VIA STRIPE`
  }[gwProvider] || `PAY ₹${amountDisplay}`;

  const gwFooterDesc = {
    RAZORPAY: 'Official Razorpay PG • Instant UPI Intent, QR, Cards & NetBanking',
    PAYU: `PayU Sandbox • Key: ${orderData?.payu?.params?.key || 'Se8qmO'} • UPI, Cards, NetBanking`,
    PHONEPE: 'PhonePe PG • Direct PhonePe Mobile Intent & Fast Dynamic QR',
    CASHFREE: 'Cashfree PG • Instant UPI, Cards & Drop Checkout',
    STRIPE: 'Stripe Checkout • Global Cards, Apple Pay, Google Pay'
  }[gwProvider] || '256-bit Encrypted Bank Grade Gateway';

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const eventName = orderData?.event?.name || 'Comics Carnival Festival';
  const venue = orderData?.event?.venue || 'Milan Mela Prangan, Kolkata';
  const subtotalRupees = ((orderData?.subtotalPaise || (orderData?.amountPaise ? orderData.amountPaise - 200 : 5000)) / 100).toFixed(2);
  const platformFeeRupees = ((orderData?.platformFeePaise || 200) / 100).toFixed(2);
  const discountRupees = orderData?.discountPaise ? (orderData.discountPaise / 100).toFixed(2) : null;
  const passCount = orderData?.attendees?.length || (orderData?.isGroupBooking ? 2 : 1);

  return (
    <div className="min-h-screen bg-[#0B0B14] text-text flex flex-col justify-between selection:bg-primary selection:text-black relative overflow-x-hidden">
      {/* Background Cyberpunk Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/10 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-accent/10 rounded-full blur-[160px]" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-info/10 rounded-full blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(#2E2E4D_1px,transparent_1px)] [background-size:24px_24px] opacity-25" />
      </div>

      <div className="relative z-10">
        <Header />

        <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 lg:py-8 flex-1">
          {/* Top Bar: Navigation + Hold Timer + Live Badge */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <button
              type="button"
              onClick={() => navigate('/checkout')}
              className="px-3.5 py-2 rounded-xl bg-surface-2/90 border border-border/80 text-text hover:text-primary transition-all flex items-center gap-2 text-xs font-mono font-bold shadow-[2px_2px_0_#000] cursor-pointer hover:-translate-y-0.5"
            >
              <ArrowLeft className="w-4 h-4 text-primary" />
              <span>Back to Checkout</span>
            </button>

            <div className="flex items-center gap-2.5">
              <div className="px-3.5 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold flex items-center gap-1.5 shadow-[2px_2px_0_#000]">
                <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>Passes Held For: <strong className="font-mono text-amber-200">{formatTimer(timeLeft)}</strong></span>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>256-bit Encrypted</span>
              </div>
            </div>
          </div>

          {/* Cancellation or Gateway Alert */}
          {payuFlag && (
            <div className="w-full mb-6 p-4 rounded-2xl bg-rose-950/40 border-2 border-rose-500 text-rose-200 text-xs font-mono flex items-start gap-3 shadow-[4px_4px_0_#000]">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
              <div>
                <span className="font-bold text-sm text-rose-300 block uppercase tracking-wide">Payment Not Completed</span>
                <p className="mt-1 leading-relaxed opacity-95">
                  {payuMsg ? decodeURIComponent(payuMsg) : 'The transaction was cancelled or declined. You can retry with any gateway below.'}
                </p>
              </div>
            </div>
          )}

          {/* 2-Column Responsive Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            
            {/* LEFT COLUMN (Col 7): Event & Order Experience */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* 1. Hero Event Banner Card */}
              <div className="relative rounded-3xl bg-gradient-to-br from-surface to-surface-2 border-2 border-primary/50 p-6 shadow-[6px_6px_0_#000] overflow-hidden">
                <div className="absolute -top-12 -right-12 w-36 h-36 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
                
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 border border-primary/40 text-primary font-mono text-[11px] font-bold uppercase tracking-wider">
                    <Zap className="w-3.5 h-3.5 text-primary" /> Instant Ingress Checkout
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 font-mono text-[10px] font-bold uppercase flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" /> Live Gateway
                  </span>
                </div>

                <h1 className="font-comic text-3xl sm:text-4xl text-white tracking-wide uppercase leading-tight">
                  {eventName}
                </h1>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-mono text-text-muted">
                  <span className="flex items-center gap-1.5 text-text">
                    <MapPin className="w-4 h-4 text-accent" /> {venue}
                  </span>
                  <span className="flex items-center gap-1.5 text-text">
                    <Calendar className="w-4 h-4 text-info" /> 3-Day Festival Access Pass
                  </span>
                </div>

                <div className="mt-4 pt-4 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-primary/10 border border-primary/30 text-primary">
                      <Ticket className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono text-text-muted uppercase block">Pass Category</span>
                      <strong className="font-comic text-lg text-primary tracking-wide">
                        {orderData?.tierName || 'GENERAL PASS'}
                      </strong>
                    </div>
                  </div>

                  <span className="px-3 py-1 rounded-xl bg-white/[0.06] border border-white/10 font-mono text-xs font-bold text-white">
                    {passCount} {passCount > 1 ? 'Passes' : 'Pass'} Included
                  </span>
                </div>
              </div>

              {/* 2. Attendee Details Card */}
              <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000]">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-primary" />
                    <h3 className="font-comic text-xl text-white tracking-wide">TICKET HOLDER DETAILS</h3>
                  </div>
                  <span className="text-[10px] font-mono text-text-muted uppercase">Verified Contact</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="p-3.5 rounded-2xl bg-surface-2/70 border border-border">
                    <span className="text-[10px] font-mono text-text-muted uppercase block">Full Name</span>
                    <strong className="font-comic text-lg text-white block mt-0.5 tracking-wide truncate">
                      {orderData?.holderName || 'Attendee'}
                    </strong>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-surface-2/70 border border-border">
                    <span className="text-[10px] font-mono text-text-muted uppercase block">Mobile (Gate QR Delivery)</span>
                    <strong className="font-mono text-sm text-info block mt-1 tracking-wider">
                      +91 {orderData?.phone ? orderData.phone.replace(/(\d{2})\d{5}(\d{3})/, '$1•••••$2') : '62•••••073'}
                    </strong>
                  </div>
                </div>

                {/* If Add-ons selected */}
                {orderData?.addOns && orderData.addOns.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/[0.08]">
                    <span className="text-[10px] font-mono text-text-muted uppercase block mb-2">Claimable Add-Ons & Merch:</span>
                    <div className="flex flex-wrap gap-2">
                      {orderData.addOns.map((add, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded-xl bg-accent/15 border border-accent/40 text-accent font-mono text-xs font-bold flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5" />
                          {add.name} (₹{(add.pricePaise / 100).toFixed(0)})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Itemized Price Breakdown */}
              <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000]">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-3">
                  <h3 className="font-comic text-xl text-white tracking-wide">PRICE BREAKDOWN</h3>
                  <span className="text-[10px] font-mono text-text-muted uppercase">Transparent Ingress</span>
                </div>

                <div className="space-y-2.5 font-mono text-xs">
                  <div className="flex justify-between items-center text-text-muted">
                    <span>{passCount} × {orderData?.tierName || 'Pass Admission'}</span>
                    <span className="text-white font-bold">₹{subtotalRupees}</span>
                  </div>

                  {discountRupees && Number(discountRupees) > 0 && (
                    <div className="flex justify-between items-center text-emerald-400">
                      <span>Promo Code Discount ({orderData?.couponCode || 'APPLIED'})</span>
                      <span className="font-bold">-₹{discountRupees}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-text-muted">
                    <span className="flex items-center gap-1">
                      Turnstile Cloud Platform Fee <span className="text-[10px] opacity-75">(incl. GST)</span>
                    </span>
                    <span className="text-white font-bold">₹{platformFeeRupees}</span>
                  </div>

                  <div className="pt-3 border-t border-white/[0.08] flex justify-between items-baseline">
                    <div>
                      <span className="font-comic text-lg text-white tracking-wide block">Total Payable</span>
                      <span className="text-[10px] text-text-muted">Direct organizer bank settlement</span>
                    </div>
                    <span className="font-comic text-3xl text-primary tracking-wide">
                      ₹{amountDisplay}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. Four-Point Ingress Guarantee Matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: QrCode, title: 'Anti-Fraud QR', desc: 'HMAC Rotating Token', c: 'text-primary' },
                  { icon: Zap, title: '<0.5s Gates', desc: 'No Turnstile Lines', c: 'text-accent' },
                  { icon: Smartphone, title: 'WhatsApp Pass', desc: 'No App Required', c: 'text-info' },
                  { icon: ShieldCheck, title: 'Bank Grade', desc: '100% Encrypted', c: 'text-success' }
                ].map(({ icon: Icon, title, desc, c }, i) => (
                  <div key={i} className="p-3.5 rounded-2xl bg-surface border border-border text-center shadow-[2px_2px_0_#000]">
                    <Icon className={`w-5 h-5 mx-auto mb-1.5 ${c}`} />
                    <strong className="block text-xs font-mono font-bold text-white uppercase">{title}</strong>
                    <span className="block text-[10px] font-mono text-text-muted mt-0.5">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* RIGHT COLUMN (Col 5): Sticky Payment Terminal HUD */}
            <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-6">
              
              {/* Order Reference Box HUD */}
              <div className="p-5 rounded-3xl bg-surface-2/90 border-2 border-primary/40 shadow-[4px_4px_0_#000] relative overflow-hidden">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-mono text-text-muted uppercase font-bold tracking-widest">
                    ORDER REFERENCE
                  </span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30 font-bold uppercase">
                    AWAITING PAYMENT
                  </span>
                </div>

                <div className="flex items-center justify-between bg-black/40 border border-white/10 rounded-2xl px-4 py-3">
                  <span className="font-mono text-xl font-bold text-info tracking-wider">
                    {orderId}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyOrderId}
                    className="flex items-center gap-1.5 text-xs font-mono text-text-muted hover:text-primary transition-colors cursor-pointer px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-2"
                  >
                    {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* ACTIVE GATEWAY PAYMENT ACTION CARD */}
              {!isPaid && (
                <div className="w-full bg-gradient-to-b from-[#141428] to-[#1a1a36] border-2 border-primary rounded-3xl p-6 shadow-[6px_6px_0_#000] relative overflow-hidden">
                  <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

                  {/* Gateway Header */}
                  <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-primary" />
                      <span className="font-comic text-xl text-white tracking-wide truncate max-w-[200px]">
                        {gwTitle}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2.5 py-0.5 rounded-full font-bold uppercase flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Test Mode
                    </span>
                  </div>

                  {/* Big Total Price Highlight */}
                  <div className="mb-5 text-center py-4 bg-black/40 rounded-2xl border border-white/10 shadow-inner">
                    <span className="text-[11px] font-mono text-text-muted uppercase block font-bold tracking-wider">
                      TOTAL AMOUNT TO PAY
                    </span>
                    <span className="font-comic text-5xl text-primary tracking-wide block mt-1">
                      ₹{amountDisplay}
                    </span>
                    <span className="text-[10px] font-mono text-text-muted block mt-1">
                      Guaranteed seat ingress • Official event pass
                    </span>
                  </div>

                  {/* Main Tactile Payment Button */}
                  <ComicButton
                    variant="primary"
                    size="lg"
                    onClick={handleLaunchPayment}
                    disabled={launchingPayU}
                    className="w-full text-lg py-4 tracking-wider shadow-[5px_5px_0_#000] font-bold uppercase cursor-pointer"
                  >
                    {launchingPayU ? (
                      <span className="flex items-center justify-center gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        CONNECTING TO {gwProvider}...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <ExternalLink className="w-5 h-5" />
                        {gwButtonText}
                      </span>
                    )}
                  </ComicButton>

                  {/* Payment Channel Logos Strip */}
                  <div className="mt-4 pt-3.5 border-t border-white/[0.08] text-center">
                    <span className="text-[9px] font-mono uppercase text-text-muted block mb-2 font-bold tracking-wider">
                      Accepted Payment Methods
                    </span>
                    <div className="flex flex-wrap items-center justify-center gap-1.5 font-mono text-[10px] text-text-muted">
                      <span className="px-2 py-0.5 rounded bg-white/[0.06] border border-white/10 text-white">UPI (GPay / PhonePe / Paytm)</span>
                      <span className="px-2 py-0.5 rounded bg-white/[0.06] border border-white/10 text-white">Cards</span>
                      <span className="px-2 py-0.5 rounded bg-white/[0.06] border border-white/10 text-white">NetBanking</span>
                    </div>
                  </div>

                  <p className="text-[10px] font-mono text-text-muted text-center mt-3 leading-tight flex items-center justify-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-success shrink-0" />
                    <span>{gwFooterDesc}</span>
                  </p>
                </div>
              )}

              {/* Developer Instant Test Approval Bypass: local dev server only, never in a production build */}
              {!isPaid && DEV_PAYMENTS && (
                <div className="w-full bg-surface-2/60 border-2 border-dashed border-emerald-500/40 rounded-3xl p-5 text-center shadow-[3px_3px_0_#000]">
                  <div className="text-xs font-mono text-emerald-400 font-bold uppercase mb-1 flex items-center justify-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-400" /> Instant Developer Bypass
                  </div>
                  <p className="text-[11px] text-text-muted mb-3.5 font-mono leading-relaxed">
                    Testing the ingress engine without live banking? Click below to immediately approve this order and generate your QR pass.
                  </p>
                  <ComicButton
                    variant="success"
                    size="md"
                    onClick={handleSimulatePayment}
                    disabled={simulating}
                    className="w-full font-bold uppercase shadow-[3px_3px_0_#000] cursor-pointer"
                  >
                    {simulating ? 'APPROVING TICKET PASS...' : '⚡ SIMULATE INSTANT APPROVAL'}
                  </ComicButton>
                </div>
              )}

              {/* Help & Support Card */}
              <div className="p-4 rounded-2xl bg-surface border border-border text-center">
                <p className="text-[11px] font-mono text-text-muted leading-relaxed">
                  Need assistance with your booking? The automated FlashPass gate support desk is active 24/7.
                </p>
              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
