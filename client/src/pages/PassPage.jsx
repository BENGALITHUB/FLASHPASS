import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { io } from 'socket.io-client';
import QRCode from 'qrcode';
// Save Image / PDF / Share pull in large libraries (jsPDF, html-to-image); load them only
// when a button is pressed so the pass itself opens fast at the gate
const loadExport = () => import('../utils/exportPass');
// Every pass in a group carries its event, so its PDF, picture and message name the right event.
const withEvent = (list, event) => list.map(p => (p.event ? p : { ...p, event }));
import Header from '../components/common/Header';
import './PassPage.css';
import {
  Download, Image, Share2, Copy, Check, Maximize2, X, Sun, Wifi,
  WifiOff, AlertTriangle, Users, ShoppingBag, Bell, ShieldAlert,
  CheckCircle, MapPin, ArrowLeft, ArrowRight, Zap, QrCode
} from 'lucide-react';

export default function PassPage() {
  const { orderId } = useParams();
  const [searchParams] = useSearchParams();
  const phoneParam = searchParams.get('phone');
  const navigate = useNavigate();
  const [passData, setPassData] = useState(null);
  const [groupPasses, setGroupPasses] = useState([]);
  const [activePassIndex, setActivePassIndex] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [zoomQR, setZoomQR] = useState(false);
  const [savedNudgeDone, setSavedNudgeDone] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState('');

  // Live real-time announcements & Emergency Evacuation
  const [announcements, setAnnouncements] = useState([]);
  const [evacuation, setEvacuation] = useState({ active: false });

  // Merch Voucher QR preview
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [voucherQrUrl, setVoucherQrUrl] = useState('');

  // 1. Fetch Pass details and setup offline cache
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check localStorage cache (phone-isolated)
    const cacheKey = phoneParam ? `cc_pass_${orderId}_${phoneParam}` : `cc_pass_${orderId}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setPassData(parsed);
        const filterPhone = phoneParam || (orderId.includes('-P') ? parsed.phone : null);
        const rawList = withEvent(parsed.groupPasses && parsed.groupPasses.length > 0 ? parsed.groupPasses : [parsed], parsed.event);
        const list = filterPhone ? rawList.filter(p => !p.phone || p.phone === filterPhone) : rawList;

        setGroupPasses(list);
        const targetIdx = list.findIndex(p => p.orderId?.toUpperCase() === orderId?.toUpperCase());
        const initialIdx = targetIdx !== -1 ? targetIdx : 0;
        setActivePassIndex(initialIdx);
        const current = list[initialIdx] || parsed;
        if (current?.qrToken) {
          generateQRCode(current.qrToken);
        }
        setLoading(false);
      } catch (e) {}
    }

    // Fetch fresh pass data with optional phone filter
    api.getPass(orderId, phoneParam)
      .then(data => {
        setPassData(data);
        document.title = 'FlashPass — High-Speed Ingress & Ticketing';
        const filterPhone = phoneParam || (orderId.includes('-P') ? data.phone : null);
        const rawList = withEvent(data.groupPasses && data.groupPasses.length > 0 ? data.groupPasses : [data], data.event);
        const list = filterPhone ? rawList.filter(p => !p.phone || p.phone === filterPhone) : rawList;

        setGroupPasses(list);
        const targetIdx = list.findIndex(p => p.orderId?.toUpperCase() === orderId?.toUpperCase());
        const initialIdx = targetIdx !== -1 ? targetIdx : 0;
        setActivePassIndex(initialIdx);
        if (data.liveAnnouncements) {
          setAnnouncements(data.liveAnnouncements);
        }
        if (data.emergencyEvacuation) {
          setEvacuation(data.emergencyEvacuation);
        }
        const current = list[initialIdx] || data;
        if (current?.qrToken) {
          generateQRCode(current.qrToken);
        }
        localStorage.setItem(cacheKey, JSON.stringify(data));
        setIsOnline(true);
        setLoading(false);
      })
      .catch(err => {
        // No HTTP status = the server couldn't be reached (venue Wi-Fi with no
        // internet still reports navigator.onLine === true), so show offline mode
        if (!err?.status) setIsOnline(false);
        if (!cached) {
          setError(err.message || 'Could not load pass');
        }
        setLoading(false);
      });

    // Real-time Socket Listener for Announcements & Evacuation
    const socket = io('/', { transports: ['websocket', 'polling'] });

    socket.on('announcement:new', (notice) => {
      setAnnouncements(prev => [notice, ...prev.filter(n => n.id !== notice.id)]);
    });

    socket.on('emergency:evacuation', (data) => {
      setEvacuation(data);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      socket.disconnect();
    };
  }, [orderId, phoneParam]);

  // Synchronize active pass index whenever URL orderId or groupPasses change
  useEffect(() => {
    if (groupPasses && groupPasses.length > 0 && orderId) {
      const targetIdx = groupPasses.findIndex(p => p.orderId?.toUpperCase() === orderId?.toUpperCase());
      if (targetIdx !== -1 && targetIdx !== activePassIndex) {
        setActivePassIndex(targetIdx);
      }
    }
  }, [orderId, groupPasses]);

  // When active group pass changes, regenerate QR code and sync device cache
  useEffect(() => {
    const current = groupPasses[activePassIndex] || passData;
    if (current?.qrToken) {
      generateQRCode(current.qrToken);
    }
    if (current?.orderId) {
      try {
        localStorage.setItem('cc_active_pass', JSON.stringify({
          orderId: current.orderId,
          holderName: current.holderName,
          badge: current.badge
        }));
      } catch (e) {}
    }
  }, [activePassIndex, groupPasses, passData]);

  const generateQRCode = async (token) => {
    try {
      const url = await QRCode.toDataURL(token, {
        width: 320,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      setQrDataUrl(url);
    } catch (e) {
      console.error('QR code generation error', e);
    }
  };

  const handleOpenVoucher = async (addon) => {
    setSelectedVoucher(addon);
    const voucherPayload = JSON.stringify({
      orderId: currentPass.orderId,
      addonId: addon.addOnId || addon.addonId,
      variant: addon.variant,
      type: 'MERCH_CLAIM'
    });
    try {
      const url = await QRCode.toDataURL(voucherPayload, { width: 280, margin: 2 });
      setVoucherQrUrl(url);
    } catch (e) {}
  };

  const currentPass = groupPasses[activePassIndex] || passData;

  const handleSelectPass = (idx) => {
    setActivePassIndex(idx);
    const target = groupPasses[idx];
    if (target?.orderId && target.orderId !== orderId) {
      const q = phoneParam ? `?phone=${phoneParam}` : '';
      navigate(`/pass/${target.orderId}${q}`, { replace: true });
    }
  };

  const handleCopyOrderId = () => {
    if (!currentPass) return;
    navigator.clipboard.writeText(currentPass.orderId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveImage = async () => {
    if (!currentPass) return;
    const { savePassImage } = await loadExport();
    await savePassImage('pass-card-node', currentPass.orderId, currentPass.holderName);
    setSavedNudgeDone(true);
  };

  const handleDownloadPDF = async () => {
    if (!currentPass) return;
    const { downloadPassPDF } = await loadExport();
    await downloadPassPDF(currentPass, qrDataUrl);
    setSavedNudgeDone(true);
  };

  const handleDownloadAllPDFs = async () => {
    if (!groupPasses || groupPasses.length === 0) return;
    setDownloadingAll(true);
    setDownloadProgress(`Preparing 1 of ${groupPasses.length}...`);

    try {
      const { downloadAllPassesPDF } = await loadExport();
      await downloadAllPassesPDF(groupPasses, (current, total, name) => {
        setDownloadProgress(`Saving ${current} of ${total}: ${name}...`);
      });
      setSavedNudgeDone(true);
    } catch (err) {
      alert('Failed to download some passes. Please try again.');
    } finally {
      setDownloadingAll(false);
      setDownloadProgress('');
    }
  };

  const handleWhatsAppShare = (pass = currentPass) => {
    if (!pass) return;
    const passUrl = `${window.location.origin}/pass/${pass.orderId}`;
    const text = encodeURIComponent(
      `Hey ${pass.holderName}! 🎟️ Here is your official entry pass for ${pass.event?.name || 'the event'} (${pass.badge || 'ALL ACCESS'}).\n\nShow this QR at the gate:\n${passUrl}\n\nPass ID: ${pass.orderId}`
    );
    const cleanPhone = pass.phone ? String(pass.phone).replace(/\D/g, '').slice(-10) : '';
    const whatsappUrl = cleanPhone
      ? `https://wa.me/91${cleanPhone}?text=${text}`
      : `https://api.whatsapp.com/send?text=${text}`;
    window.open(whatsappUrl, '_blank');
    setSavedNudgeDone(true);
  };

  const handleShare = async () => {
    if (!currentPass) return;
    const { sharePass } = await loadExport();
    await sharePass('pass-card-node', currentPass);
    setSavedNudgeDone(true);
  };

  if (loading) {
    return (
      <div className="pass-page min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="pp-loader" aria-hidden="true" />
        <p className="pp-foil font-comic text-2xl tracking-wide motion-safe:animate-pulse">LOADING DIGITAL PASS...</p>
      </div>
    );
  }

  if (error || !currentPass) {
    return (
      <div className="pass-page min-h-screen flex flex-col justify-between">
        <Header />
        <main className="max-w-md mx-auto p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-danger mx-auto mb-3" />
          <h2 className="font-comic text-2xl text-danger mb-2">PASS NOT FOUND</h2>
          <p className="text-xs text-text-muted font-mono mb-4">{error || 'Please check your Order ID.'}</p>
          <Link to="/my-ticket" className="text-primary font-comic underline">Try My Ticket Recovery →</Link>
        </main>
      </div>
    );
  }

  const isVip = currentPass.tierId === 'vip';
  const isCosplay = currentPass.tierId === 'cosplay';
  const tier = isVip ? 'vip' : isCosplay ? 'cosplay' : 'general';
  const notice = announcements[0];

  return (
    <div className="pass-page min-h-screen flex flex-col justify-between">
      <Header />
      <div className="pp-atmosphere pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />

      <main className="relative max-w-md mx-auto w-full px-4 py-5 flex-1">
        {/* Top Back & Navigation Bar */}
        <div className="flex items-center justify-between mb-4 px-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="pp-metal-btn min-h-10 px-3.5 rounded-xl flex items-center gap-1.5 text-xs font-mono font-bold"
            title="Back to previous page"
          >
            <ArrowLeft className="w-4 h-4 text-primary" />
            <span>Back</span>
          </button>

          <Link to="/my-ticket" className="pp-link inline-flex min-h-10 items-center gap-1 text-[11px] font-mono font-bold">
            Ticket Recovery <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* EMERGENCY EVACUATION PULSING SIREN BANNER */}
        {evacuation.active && (
          <div role="alert" className="mb-4 bg-danger text-white p-3.5 rounded-2xl border-4 border-black animate-pulse shadow-[4px_4px_0_#000]">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-6 h-6 animate-bounce" />
              <span className="font-comic text-base tracking-wide uppercase">
                EMERGENCY EVACUATION ACTIVE
              </span>
            </div>
            <p className="text-xs font-mono font-bold leading-tight">
              {evacuation.message || 'Please proceed calmly to the nearest exit. Follow the volunteers.'}
            </p>
          </div>
        )}

        {/* LIVE ANNOUNCEMENT TICKER */}
        {notice && !evacuation.active && (
          <div className="pp-notice mb-4 rounded-2xl p-px" aria-live="polite">
            <div className="pp-notice-inner rounded-[15px] p-3 flex items-start gap-3">
              <div className="pp-notice-icon p-1.5 rounded-xl shrink-0">
                <Bell className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-accent font-comic text-base uppercase tracking-wide truncate">
                    {notice.title || 'Live Event Notice'}
                  </span>
                  <span className="pp-live-tag shrink-0 font-mono text-[9px] font-bold px-1.5 py-0.5 rounded">
                    LIVE
                  </span>
                </div>
                {notice.message && (
                  <p className="text-text font-sans font-medium text-xs leading-snug mt-1">{notice.message}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Status Bar: Online/Offline indicator */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="pp-pill pp-pill-valid inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            Valid for entry
          </span>

          {isOnline ? (
            <span className="pp-pill pp-pill-sync inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] font-bold">
              <Wifi className="w-3.5 h-3.5" /> Live Gate Sync
            </span>
          ) : (
            <span className="pp-pill pp-pill-offline inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] font-bold">
              <WifiOff className="w-3.5 h-3.5" /> Offline Pass Mode
            </span>
          )}
        </div>

        {/* GROUP PASS SWITCHER TABS */}
        {groupPasses.length > 1 && (
          <div className="pp-panel mb-3 p-2.5 rounded-2xl">
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <Users className="w-4 h-4 text-accent" />
              <span className="text-xs font-mono font-bold uppercase text-accent tracking-wide">
                Group Passes ({groupPasses.length} Friends)
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {groupPasses.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectPass(idx)}
                  aria-pressed={activePassIndex === idx}
                  className={`pp-tab min-h-9 px-2 py-1.5 rounded-xl font-mono text-xs font-bold truncate ${activePassIndex === idx ? 'pp-tab-active' : ''}`}
                >
                  #{idx + 1} {p.holderName.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Gate Brightness Hint */}
        <div className="pp-hint mb-4 flex items-center justify-center gap-2 text-[11px] font-mono text-center">
          <Sun className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span>Turn up phone brightness at the gate for instant scan</span>
        </div>

        {/* PASS CARD — black metal ticket with a foil frame (metal depends on tier) */}
        <div id="pass-card-node" data-tier={tier} className="pp-card-frame relative mb-5">
          <div className="pp-card relative overflow-hidden">
            <div className="pp-card-sheen" aria-hidden="true" />

            {/* Head: brand + event + tier */}
            <div className="pp-card-head flex items-center justify-between gap-3 px-5 pt-4 pb-3">
              <div className="min-w-0">
                <span className="pp-foil flex items-center gap-1.5 font-comic text-xl tracking-wider leading-none">
                  <Zap className="w-4 h-4 pp-foil-icon" /> FLASHPASS
                </span>
                <span className="mt-1.5 block truncate font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-info">
                  {[currentPass.event?.name || passData?.event?.name, (currentPass.event?.venue || passData?.event?.venue || '').split(',').pop().trim()].filter(Boolean).join(' • ')}
                </span>
              </div>
              <span className="pp-tier shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1 font-comic text-sm tracking-wider uppercase">
                ★ {currentPass.badge || (isVip ? 'VIP SUPERFAN' : isCosplay ? 'COSPLAY CREATOR' : 'GENERAL PASS')}
              </span>
            </div>

            {/* White Scannable QR Box (kept pure white/black for scanners) */}
            <div className="px-5 pt-4 pb-5">
              <button
                type="button"
                className="pp-qr group relative block w-full max-w-[272px] mx-auto rounded-2xl p-3"
                onClick={() => setZoomQR(true)}
                aria-label="Enlarge gate QR code"
              >
                <span className="pp-qr-corner pp-qr-tl" aria-hidden="true" />
                <span className="pp-qr-corner pp-qr-tr" aria-hidden="true" />
                <span className="pp-qr-corner pp-qr-bl" aria-hidden="true" />
                <span className="pp-qr-corner pp-qr-br" aria-hidden="true" />
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Gate Pass QR" className="w-full h-auto aspect-square block mx-auto rounded-lg" />
                ) : (
                  <div className="w-full aspect-square bg-gray-100 rounded-lg flex items-center justify-center text-black font-mono text-xs">
                    Generating QR...
                  </div>
                )}
                <span className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center text-white text-xs font-mono font-bold gap-1">
                  <Maximize2 className="w-4 h-4" /> Tap to enlarge
                </span>
              </button>
              <p className="mt-3 flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
                <Maximize2 className="w-3 h-3" /> Tap QR for scanner view
              </p>
            </div>

            {/* Tear line */}
            <div className="pp-tear relative mx-5" aria-hidden="true">
              <span className="pp-notch pp-notch-l" />
              <span className="pp-notch pp-notch-r" />
            </div>

            {/* Attendee Details & Photo Badge */}
            <div className="px-5 pt-5 pb-4 text-center flex flex-col items-center">
              {currentPass.photoUrl ? (
                <div className="relative mb-3">
                  <div className="pp-photo-ring rounded-2xl p-[2px]">
                    <img
                      src={currentPass.photoUrl}
                      alt={currentPass.holderName}
                      className="w-20 h-20 rounded-[14px] object-cover block bg-surface-2"
                    />
                  </div>
                  <span className="pp-verified absolute -bottom-2.5 inset-x-0 mx-auto w-max inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[9px] font-bold uppercase tracking-wider">
                    <CheckCircle className="w-3 h-3" /> Verified
                  </span>
                </div>
              ) : null}

              <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-text-muted mt-1">Pass holder</span>
              <h3 className="pp-name font-comic text-3xl tracking-wide uppercase leading-none mt-1.5 break-words">
                {currentPass.holderName}
              </h3>
              <p className="font-mono text-xs text-text-muted tracking-[0.2em] mt-1.5">
                {currentPass.maskedPhone || currentPass.phone}
              </p>
            </div>

            {/* Allowed Zones + Valid Days */}
            <div className="px-5 pb-5 space-y-3">
              {currentPass.allowedZones && currentPass.allowedZones.length > 0 && (
                <div className="flex items-center justify-center gap-1.5 flex-wrap">
                  <MapPin className="w-3.5 h-3.5 text-info flex-shrink-0" />
                  <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider mr-0.5">Zones</span>
                  {currentPass.allowedZones.map((z, idx) => (
                    <span key={idx} className="pp-zone text-[10px] font-mono font-bold px-2 py-1 rounded-md uppercase">
                      {z.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map(d => {
                  const isValid = currentPass.validDays && currentPass.validDays.includes(d);
                  return (
                    <span
                      key={d}
                      className={`pp-day flex items-center justify-center gap-1 rounded-xl py-2 font-mono text-xs font-bold ${isValid ? 'pp-day-valid' : 'pp-day-off'}`}
                    >
                      DAY {d} {isValid ? <Check className="w-3.5 h-3.5" /> : null}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Holographic strip with the pass ID */}
            <div className="pp-strip flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <span className="block font-mono text-[9px] font-bold uppercase tracking-[0.2em] opacity-80">Pass ID</span>
                <span className="block font-mono text-sm font-bold tracking-wider truncate">{currentPass.orderId}</span>
              </div>
              <button
                onClick={handleCopyOrderId}
                className="pp-copy inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 font-mono text-[10px] font-bold uppercase"
                aria-label="Copy pass ID"
              >
                {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy</>}
              </button>
            </div>
          </div>
        </div>

        {/* ADD-ON & MERCH PRE-ORDER VOUCHERS */}
        {currentPass.addOns && currentPass.addOns.length > 0 && (
          <div className="pp-panel mb-4 p-4 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <ShoppingBag className="w-4 h-4 text-primary" />
              <span className="font-comic text-base tracking-wide text-text uppercase">
                Add-on & Merch Vouchers
              </span>
            </div>

            <div className="space-y-2">
              {currentPass.addOns.map((item, idx) => {
                const isClaimed = item.claimed;
                return (
                  <div
                    key={idx}
                    className={`pp-voucher p-3 rounded-xl flex items-center justify-between gap-3 ${isClaimed ? 'opacity-60' : ''}`}
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-bold text-text">
                        {item.name} {item.variant ? `(${item.variant})` : ''}
                      </div>
                      <span className="text-[10px] font-mono text-text-muted block mt-0.5">
                        Qty: {item.quantity || 1} • {isClaimed ? 'Claimed at Stall' : 'Unclaimed'}
                      </span>
                    </div>

                    {isClaimed ? (
                      <span className="shrink-0 px-2 py-1 rounded-md bg-success/15 text-success text-[10px] font-mono font-bold border border-success/40 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> CLAIMED
                      </span>
                    ) : (
                      <button
                        onClick={() => handleOpenVoucher(item)}
                        className="pp-yellow-btn shrink-0 min-h-9 px-3 rounded-lg font-mono text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <QrCode className="w-3.5 h-3.5" /> REDEEM
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Nudge: Save pass */}
        {!savedNudgeDone && (
          <div className="pp-nudge rounded-xl p-3 mb-4 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Save your pass now — you'll need it at the gate!
            </span>
            <button
              onClick={() => setSavedNudgeDone(true)}
              className="min-h-8 min-w-8 inline-flex items-center justify-center rounded-lg text-text-muted hover:text-text"
              aria-label="Dismiss reminder"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Clean, Balanced Action Buttons */}
        <div className="space-y-2.5 mb-5">
          {/* Main Hero Download Button */}
          {groupPasses.length > 1 ? (
            <button
              type="button"
              onClick={handleDownloadAllPDFs}
              disabled={downloadingAll}
              className="pp-yellow-btn w-full min-h-12 py-3 rounded-2xl inline-flex items-center justify-center gap-2 font-comic text-base tracking-wide shadow-[3px_3px_0_#000] cursor-pointer"
            >
              <Download className="w-5 h-5 text-black shrink-0" />
              <span>
                {downloadingAll
                  ? (downloadProgress || 'PREPARING PASSES...')
                  : `DOWNLOAD ALL ${groupPasses.length} PASSES (SEPARATE PDFs)`}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="pp-yellow-btn w-full min-h-12 py-3 rounded-2xl inline-flex items-center justify-center gap-2 font-comic text-base tracking-wide shadow-[3px_3px_0_#000] cursor-pointer"
            >
              <Download className="w-5 h-5 text-black shrink-0" />
              <span>DOWNLOAD DIGITAL PASS (PDF)</span>
            </button>
          )}

          {/* Secondary Quick Action Grid: PDF & WhatsApp */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="pp-metal-btn min-h-11 py-2 px-3 rounded-xl inline-flex items-center justify-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-accent transition-all hover:-translate-y-0.5 cursor-pointer"
              title="Download PDF for currently active pass"
            >
              <Download className="w-4 h-4 text-accent shrink-0" />
              <span className="truncate">{groupPasses.length > 1 ? `Single PDF (${currentPass.holderName.split(' ')[0]})` : 'Download PDF'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleWhatsAppShare(currentPass)}
              className="pp-metal-btn min-h-11 py-2 px-3 rounded-xl inline-flex items-center justify-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 transition-all hover:-translate-y-0.5 cursor-pointer"
              title="Share currently active pass on WhatsApp"
            >
              <Share2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="truncate">Share on WhatsApp</span>
            </button>
          </div>
        </div>

        {/* Group Passes Overview & Distribution */}
        {groupPasses.length > 1 && (
          <div className="pp-panel p-4 rounded-3xl mb-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-accent shrink-0" />
                <span className="font-comic text-base tracking-wider text-white uppercase leading-none">
                  All {groupPasses.length} Group Passes
                </span>
              </div>
              <span className="text-[10px] font-mono font-bold text-text-muted uppercase tracking-wider">
                Individual Gate QRs
              </span>
            </div>

            {/* List of Attendee Cards */}
            <div className="space-y-3">
              {groupPasses.map((p, idx) => {
                const isActive = activePassIndex === idx;
                return (
                  <div
                    key={p.orderId || idx}
                    className={`rounded-2xl p-3.5 border-2 transition-all ${
                      isActive
                        ? 'bg-primary/10 border-primary shadow-[3px_3px_0_#000]'
                        : 'bg-black/30 border-white/10 hover:border-white/20'
                    }`}
                  >
                    {/* Top Row: Info + Active indicator */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-accent/20 text-accent border border-accent/40 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                            #{idx + 1}
                          </span>
                          <span className="font-comic text-base text-white tracking-wide uppercase truncate block">
                            {p.holderName}
                          </span>
                        </div>
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1 font-mono text-[11px] text-text-muted">
                          <span>{p.maskedPhone || p.phone}</span>
                          <span className="text-white/20">•</span>
                          <span className="text-info font-bold whitespace-nowrap">{p.orderId}</span>
                        </div>
                      </div>

                      {isActive ? (
                        <span className="px-2 py-0.5 rounded-full bg-primary text-black font-mono text-[9px] font-bold uppercase tracking-wider shrink-0 shadow-[1px_1px_0_#000]">
                          VIEWING
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSelectPass(idx)}
                          className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-primary hover:text-black border border-white/15 text-primary font-mono text-[10px] font-bold uppercase tracking-wider transition-all shrink-0 cursor-pointer"
                        >
                          SHOW QR
                        </button>
                      )}
                    </div>

                    {/* Bottom Action Row: WhatsApp & Download PDF (Full width, NO WRAPPING) */}
                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-white/5">
                      <button
                        type="button"
                        onClick={() => handleWhatsAppShare(p)}
                        className="py-1.5 px-2 rounded-lg bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/30 text-[#25D366] font-mono text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                        title={`Share ${p.holderName}'s pass on WhatsApp`}
                      >
                        <Share2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Send WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          const qrUrl = await QRCode.toDataURL(p.qrToken, { width: 320, margin: 2 });
                          loadExport().then(({ downloadPassPDF }) => downloadPassPDF(p, qrUrl));
                        }}
                        className="py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/15 text-text font-mono text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                        title={`Download PDF for ${p.holderName}`}
                      >
                        <Download className="w-3.5 h-3.5 shrink-0 text-accent" />
                        <span>Download PDF</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Full-screen QR Zoom Modal */}
      {zoomQR && (
        <div className="pp-modal fixed inset-0 z-50 flex flex-col items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="Gate scanner view">
          <button
            onClick={() => setZoomQR(false)}
            className="pp-metal-btn absolute top-5 right-5 p-3 rounded-full"
            aria-label="Close scanner view"
          >
            <X className="w-6 h-6" />
          </button>
          <p className="pp-foil font-comic text-3xl tracking-wide mb-5">GATE SCANNER VIEW</p>
          <div className="pp-qr pp-qr-zoom relative max-w-xs w-full rounded-3xl p-4">
            <span className="pp-qr-corner pp-qr-tl" aria-hidden="true" />
            <span className="pp-qr-corner pp-qr-tr" aria-hidden="true" />
            <span className="pp-qr-corner pp-qr-bl" aria-hidden="true" />
            <span className="pp-qr-corner pp-qr-br" aria-hidden="true" />
            <img src={qrDataUrl} alt="Enlarged QR" className="w-full h-auto aspect-square block rounded-lg" />
          </div>
          <p className="font-mono text-xs text-text-muted mt-5 tracking-wider">Hold phone towards gate volunteer</p>
        </div>
      )}

      {/* Merch Claim Voucher QR Modal */}
      {selectedVoucher && (
        <div className="pp-modal fixed inset-0 z-50 flex flex-col items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="Merch voucher QR">
          <div className="pp-card-frame max-w-xs w-full" data-tier="vip">
            <div className="pp-card p-5 text-center">
              <div className="flex justify-between items-center mb-3">
                <span className="pp-foil font-comic text-lg tracking-wide">MERCH VOUCHER QR</span>
                <button
                  onClick={() => setSelectedVoucher(null)}
                  className="pp-metal-btn p-1.5 rounded-lg hover:text-danger"
                  aria-label="Close voucher"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs font-mono font-bold text-text mb-3">
                {selectedVoucher.name} {selectedVoucher.variant ? `(${selectedVoucher.variant})` : ''}
              </p>
              <div className="pp-qr relative max-w-[220px] mx-auto mb-3 rounded-2xl p-3">
                {voucherQrUrl && <img src={voucherQrUrl} alt="Voucher QR" className="w-full aspect-square rounded-lg" />}
              </div>
              <p className="text-[11px] font-mono text-text-muted leading-relaxed">
                Show this QR to the festival merchandise desk volunteer to claim your item.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
