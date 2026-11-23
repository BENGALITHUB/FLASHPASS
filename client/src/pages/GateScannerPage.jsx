import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../services/api';
import { initSocket } from '../services/socket';
import { playSuccessChime, playExitChime, playRejectionBuzzer, playWarningTone } from '../utils/audioFeedback';
import './GateScannerPage.css';
import {
  Keyboard, Flashlight, LogOut, CheckCircle2, XCircle, AlertTriangle,
  Users, ShieldAlert, ShoppingBag, MapPin, Zap, ArrowLeft, ArrowRight,
  LogIn, Camera, Check, ScanLine
} from 'lucide-react';

const GATE_OPTIONS = [
  { gate: 'Gate 1', zone: 'MAIN_HALL', place: 'Main Hall' },
  { gate: 'Gate 2', zone: 'MAIN_HALL', place: 'East Concourse' }
];

const MODE_OPTIONS = [
  { id: 'ENTRY', label: 'ENTRY', hint: 'Let fans in', icon: LogIn },
  { id: 'EXIT', label: 'EXIT', hint: 'Log exits', icon: LogOut },
  { id: 'MERCH', label: 'MERCH', hint: 'Hand out merch', icon: ShoppingBag }
];

export default function GateScannerPage() {
  const navigate = useNavigate();
  const [gateId, setGateId] = useState('Gate 1');
  const [zoneId, setZoneId] = useState('MAIN_HALL');
  const [mode, setMode] = useState('ENTRY'); // 'ENTRY', 'EXIT', or 'MERCH'
  const [isSetup, setIsSetup] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [manualModal, setManualModal] = useState(false);
  const [manualOrderId, setManualOrderId] = useState('');
  const [manualAddonId, setManualAddonId] = useState('');
  const [stats, setStats] = useState({ insideNow: 0, scansLastHour: 0, todayFootfall: 0 });
  const [torchOn, setTorchOn] = useState(false);
  const [evacuation, setEvacuation] = useState({ active: false });
  // Hand-stamp mode: scan once per day on entry, no exit scanning
  const [reentryMode, setReentryMode] = useState('WRISTBAND'); // server default; replaced by the event's setting on load
  const stampMode = reentryMode === 'WRISTBAND';
  const modeOptions = stampMode ? MODE_OPTIONS.filter(m => m.id !== 'EXIT') : MODE_OPTIONS;

  useEffect(() => {
    if (stampMode && mode === 'EXIT') setMode('ENTRY');
  }, [stampMode, mode]);

  // Real connection status (SRS FR-M6-08): the phone's network flag plus a
  // server ping every 8s. offlineSince drives the emergency notice after 60s.
  const [online, setOnline] = useState(true);
  const [offlineSince, setOfflineSince] = useState(null);
  const [, setTick] = useState(0);
  const markOnline = () => { setOnline(true); setOfflineSince(null); };
  const markOffline = () => { setOnline(false); setOfflineSince(prev => prev || Date.now()); };

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      if (!navigator.onLine) { markOffline(); return; }
      try {
        const res = await fetch('/api/v1/health', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
        if (!cancelled) (res.ok ? markOnline() : markOffline());
      } catch {
        if (!cancelled) markOffline();
      }
    };
    ping();
    const interval = setInterval(ping, 8000);
    const tick = setInterval(() => setTick(t => t + 1), 5000); // refresh the "offline for Ns" text
    window.addEventListener('online', ping);
    window.addEventListener('offline', markOffline);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearInterval(tick);
      window.removeEventListener('online', ping);
      window.removeEventListener('offline', markOffline);
    };
  }, []);
  const offlineSeconds = offlineSince ? Math.round((Date.now() - offlineSince) / 1000) : 0;

  const html5QrCodeRef = useRef(null);
  const lastScannedRef = useRef({ code: '', time: 0 });

  useEffect(() => {
    document.title = 'Gate Ingress Scanner — FlashPass';
    if (!localStorage.getItem('cc_staff_user')) {
      navigate('/staff');
      return;
    }

    // Socket listener for crowd stats and emergency siren
    const socket = initSocket();
    socket.on('gate:stats', (data) => {
      setStats(prev => ({
        ...prev,
        insideNow: data.insideNow,
        ...(data.todayFootfall !== undefined ? { todayFootfall: data.todayFootfall } : {})
      }));
    });

    socket.on('emergency:evacuation', (data) => {
      setEvacuation(data);
    });

    api.gateStats()
      .then(res => {
        setStats(res);
        if (res?.reentryMode) setReentryMode(res.reentryMode);
      })
      .catch(e => {});

    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
    };
  }, [navigate]);

  const startCamera = async () => {
    setIsSetup(true);
    setTimeout(async () => {
      try {
        const scanner = new Html5Qrcode('qr-reader-container');
        html5QrCodeRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 250, height: 250 }
          },
          onScanSuccess,
          () => {} // Ignore scan failure frames
        );
      } catch (err) {
        console.error('Camera start error', err);
      }
    }, 150);
  };

  const onScanSuccess = async (decodedText) => {
    const now = Date.now();
    if (lastScannedRef.current.code === decodedText && now - lastScannedRef.current.time < 3000) {
      return;
    }
    lastScannedRef.current = { code: decodedText, time: now };

    if (mode === 'MERCH') {
      await processMerchScan(decodedText);
    } else {
      await processGateScan({ qrToken: decodedText });
    }
  };

  const processGateScan = async (payload) => {
    try {
      // A scan on bad venue Wi-Fi must not hang: give up after 6s
      const res = await Promise.race([
        api.gateScan({
          ...payload,
          gateId,
          zoneId,
          mode,
          deviceId: `gate-device-${gateId.replace(/\s+/g, '-').toLowerCase()}`
        }),
        new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { offline: true })), 6000))
      ]);
      markOnline();
      handleScanFeedback(res);
    } catch (err) {
      // No HTTP status = the request never reached the server
      if (err.offline || !err.status) {
        markOffline();
        handleScanFeedback({
          result: 'NO_CONNECTION',
          message: 'This scan was NOT checked. Do not let them in on this scan. Wait for "Online" and scan again.'
        });
        return;
      }
      handleScanFeedback({
        result: 'ERROR',
        message: err.message || 'Server error'
      });
    }
  };

  const processMerchScan = async (decodedText) => {
    try {
      let orderId = decodedText;
      let addonId = '';

      // Check if it's JSON from pass voucher
      try {
        const parsed = JSON.parse(decodedText);
        if (parsed.orderId) {
          orderId = parsed.orderId;
          addonId = parsed.addonId;
        }
      } catch (e) {
        // Plain QR token or Order ID
      }

      const res = await api.claimAddOnVoucher({
        orderId,
        addonId,
        volunteerStaffId: 'staff-gate'
      });

      setScanResult({
        result: 'MERCH_CLAIMED',
        holderName: res.holderName || orderId,
        message: `CLAIM CONFIRMED: ${res.item?.name || 'Voucher Item'} (Qty: ${res.item?.quantity || 1}) marked as claimed! Hand item over now.`,
      });
      playSuccessChime();
      setTimeout(() => setScanResult(null), 3000);
    } catch (err) {
      setScanResult({
        result: 'MERCH_ERROR',
        message: err.message || 'Could not claim merch voucher'
      });
      playRejectionBuzzer();
    }
  };

  const handleScanFeedback = (res) => {
    setScanResult(res);

    if (res.result === 'ENTRY_OK') {
      playSuccessChime();
      setTimeout(() => setScanResult(null), 1200);
    } else if (res.result === 'EXIT_OK' || res.result === 'EVACUATION_EXIT') {
      playExitChime();
      setTimeout(() => setScanResult(null), 1400);
    } else if (res.result === 'NO_CONNECTION') {
      playWarningTone(); // not the fraud buzzer: the pass may be fine, the network isn't
    } else if (res.result === 'EXIT_NOT_INSIDE' || res.result === 'EXIT_NOT_NEEDED') {
      playWarningTone();
      setTimeout(() => setScanResult(null), 1800);
    } else if (res.result === 'ZONE_ACCESS_DENIED') {
      playRejectionBuzzer();
    } else {
      playRejectionBuzzer();
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualOrderId.trim()) return;

    if (mode === 'MERCH') {
      await processMerchScan(manualOrderId.trim().toUpperCase());
    } else {
      await processGateScan({ orderId: manualOrderId.trim().toUpperCase() });
    }
    setManualModal(false);
    setManualOrderId('');
  };

  const toggleTorch = async () => {
    try {
      if (html5QrCodeRef.current) {
        await html5QrCodeRef.current.applyVideoConstraints({
          advanced: [{ torch: !torchOn }]
        });
        setTorchOn(!torchOn);
      }
    } catch (e) {}
  };

  return (
    <div className="gate-scanner-page isolate min-h-screen text-text flex flex-col justify-between select-none relative overflow-hidden">
      <div className="gs-atmosphere pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
      {/* EMERGENCY EVACUATION FULL-WIDTH WARNING */}
      {evacuation.active && (
        <div className="bg-danger text-white p-3 font-mono text-center font-bold text-xs uppercase animate-pulse border-b-2 border-black flex items-center justify-center gap-2">
          <ShieldAlert className="w-5 h-5 animate-bounce" />
          <span>EMERGENCY EVACUATION ACTIVE • ALL EXITS UNLOCKED • ALLOW FREE INGRESS PASSAGE</span>
        </div>
      )}

      {/* Step 1: Gate Setup Screen */}
      {!isSetup ? (
        <div className="relative max-w-md mx-auto w-full px-5 py-6 my-auto">
          <div className="flex items-center justify-between gap-2 mb-5">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="gs-metal-btn min-h-10 px-3.5 rounded-xl flex items-center gap-1.5 font-mono text-xs font-bold"
              title="Go to previous page"
            >
              <ArrowLeft className="w-4 h-4 text-primary" />
              <span>Back</span>
            </button>
            <span className="gs-eyebrow inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              Staff console
            </span>
          </div>

          <div className="gs-frame">
            <div className="gs-surface relative overflow-hidden p-5 sm:p-6">
              <div className="text-center mb-6">
                <div className="gs-title-icon mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl">
                  <ScanLine className="h-6 w-6" />
                </div>
                <h1 className="gs-foil font-comic text-5xl tracking-wide leading-none">GATE SETUP</h1>
                <p className="mt-2 text-xs font-mono text-text-muted">Select your assigned gate, zone & scanner mode</p>
              </div>

              <div className="space-y-6">
                {/* Gate & Zone Choice */}
                <fieldset>
                  <legend className="gs-step mb-3 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em]">
                    <span className="gs-step-num">01</span>
                    <MapPin className="w-3.5 h-3.5 text-primary" /> Gate & hall location
                  </legend>
                  <div className="grid grid-cols-2 gap-2.5">
                    {GATE_OPTIONS.map(item => {
                      const active = gateId === item.gate;
                      return (
                        <button
                          key={item.gate}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setGateId(item.gate);
                            setZoneId(item.zone);
                          }}
                          className={`gs-gate relative min-h-[84px] p-3.5 rounded-2xl text-left ${active ? 'gs-gate-active' : ''}`}
                        >
                          {active && (
                            <span className="gs-gate-check absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full">
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </span>
                          )}
                          <div className="gs-gate-name font-comic text-2xl leading-none tracking-wide">{item.gate.toUpperCase()}</div>
                          <div className="mt-1.5 text-[11px] font-sans font-medium text-text-muted truncate">{item.place}</div>
                          <span className="gs-zone mt-2 inline-block rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider">
                            {item.zone.replace('_', ' ')}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Mode Choice (ENTRY, EXIT, or MERCH) */}
                <fieldset>
                  <legend className="gs-step mb-3 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em]">
                    <span className="gs-step-num">02</span> Scanner mode
                  </legend>
                  {stampMode && (
                    <p className="mb-3 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 font-mono text-[11px] leading-relaxed text-warning">
                      ✋ HAND STAMP MODE — scan each pass once per day, then stamp the hand. People coming back show the stamp; don't scan them.
                    </p>
                  )}
                  <div className={`grid gap-2.5 ${modeOptions.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {modeOptions.map(({ id, label, hint, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={mode === id}
                        onClick={() => setMode(id)}
                        data-mode={id}
                        className={`gs-mode flex flex-col items-center justify-center gap-1.5 rounded-2xl px-2 py-3.5 ${mode === id ? 'gs-mode-active' : ''}`}
                      >
                        <span className="gs-mode-icon flex h-9 w-9 items-center justify-center rounded-xl">
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <span className="font-comic text-lg leading-none tracking-wide">{label}</span>
                        <span className="text-[10px] font-mono text-text-muted leading-tight text-center">{hint}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                {/* Selection summary */}
                <div className="gs-summary flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 font-mono text-[11px]">
                  <span className="text-text-muted uppercase tracking-wider">Ready</span>
                  <span className="font-bold text-text truncate">
                    {gateId} • {zoneId.replace('_', ' ')} • <span data-mode={mode} className="gs-summary-mode">{mode}</span>
                  </span>
                </div>

                <button type="button" onClick={startCamera} className="gs-launch relative overflow-hidden w-full min-h-[60px] rounded-2xl inline-flex items-center justify-center gap-2.5 font-comic text-2xl tracking-wide">
                  <Camera className="h-6 w-6" />
                  LAUNCH SCANNER CAMERA
                  <ArrowRight className="h-6 w-6" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Step 2: Live Scanner Interface */
        <div className="flex flex-col min-h-dvh justify-between">
          {/* Header Bar Colored by Mode */}
          <div className={`px-4 py-2.5 flex items-center justify-between border-b-2 border-black font-mono font-bold text-xs ${
            mode === 'ENTRY' ? 'bg-info text-black' : mode === 'EXIT' ? 'bg-exit text-white' : 'bg-accent text-white'
          }`}>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (html5QrCodeRef.current) html5QrCodeRef.current.stop().catch(()=>{});
                  navigate(-1);
                }}
                className="p-1 rounded-lg bg-black/20 hover:bg-black/40 transition-colors mr-1"
                title="Go to previous page"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="font-comic text-lg tracking-wider uppercase">
                {mode} • {gateId} ({zoneId.replace('_', ' ')}){stampMode && mode === 'ENTRY' ? ' • STAMP' : ''}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span
                role="status"
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 border border-black ${online ? 'bg-success text-black' : 'bg-danger text-white animate-pulse'}`}
              >
                <span className={`w-2 h-2 rounded-full ${online ? 'bg-black' : 'bg-white'}`} />
                {online ? 'Online' : 'Offline — scans paused'}
              </span>
              <button
                onClick={() => {
                  if (html5QrCodeRef.current) html5QrCodeRef.current.stop();
                  setIsSetup(false);
                }}
                className="underline text-[11px]"
              >
                Change
              </button>
            </div>
          </div>

          {/* Connection lost: say so plainly (SRS NFR-AV-03: emergency procedure after 60s) */}
          {!online && (
            <div role="alert" className={`px-4 py-3 border-b-2 border-black font-mono text-xs font-bold text-center ${offlineSeconds >= 60 ? 'bg-zinc-700 text-white' : 'bg-danger text-white'}`}>
              {offlineSeconds >= 60 ? (
                <>NO CONNECTION for {offlineSeconds}s. Switch to the EMERGENCY PROCEDURE: check the pass on screen, write down the Order ID, stamp the hand. Tell the gate lead.</>
              ) : (
                <>NO CONNECTION. Scans cannot be checked right now. Do not let anyone in on a scan until it says Online.</>
              )}
            </div>
          )}

          {/* Central Camera View Box */}
          <div className="relative flex-1 flex flex-col items-center justify-center p-4">
            <div className="gs-cam relative w-full max-w-xs aspect-square" data-mode={mode}>
              <div className="relative w-full h-full rounded-3xl overflow-hidden bg-black">
                <div id="qr-reader-container" className="w-full h-full"></div>
                {/* Overlay only — the camera feed underneath is untouched */}
                <div className="gs-cam-line pointer-events-none absolute inset-x-6" aria-hidden="true" />
              </div>
              <span className="gs-cam-corner gs-tl" aria-hidden="true" />
              <span className="gs-cam-corner gs-tr" aria-hidden="true" />
              <span className="gs-cam-corner gs-bl" aria-hidden="true" />
              <span className="gs-cam-corner gs-br" aria-hidden="true" />
            </div>

            {/* Live Stats Under Camera */}
            <div className="gs-summary mt-5 flex items-center gap-2 rounded-full px-4 py-2 font-mono text-xs text-text-muted">
              <Users className="w-4 h-4 text-primary" />
              {stampMode ? (
                <span>Came in today: <strong className="text-text font-bold">{stats.todayFootfall || 0}</strong></span>
              ) : (
                <span>Inside Hall: <strong className="text-text font-bold">{stats.insideNow}</strong></span>
              )}
            </div>
          </div>

          {/* Bottom Action Controls */}
          <div className="gs-dock p-4 flex gap-3 max-w-md mx-auto w-full">
            <button
              type="button"
              onClick={() => setManualModal(true)}
              className="gs-metal-btn flex-1 min-h-12 rounded-2xl inline-flex items-center justify-center gap-2 font-comic text-lg tracking-wide"
            >
              <Keyboard className="w-4 h-4 text-primary" />
              <span>{mode === 'MERCH' ? 'MANUAL VOUCHER' : 'ENTER ORDER ID'}</span>
            </button>

            <button
              type="button"
              onClick={toggleTorch}
              aria-pressed={torchOn}
              aria-label="Flashlight"
              title="Flashlight"
              className={`gs-metal-btn min-h-12 px-4 rounded-2xl inline-flex items-center justify-center ${torchOn ? 'gs-torch-on' : ''}`}
            >
              <Flashlight className={`w-5 h-5 ${torchOn ? 'text-primary' : 'text-text-muted'}`} />
            </button>
          </div>
        </div>
      )}

      {/* Manual Order ID Entry Modal */}
      {manualModal && (
        <div className="responsive-dialog fixed inset-0 z-[70] bg-black/85 flex items-start justify-center p-4 overflow-y-auto overscroll-contain">
          <div className="gs-frame max-w-xs w-full my-auto">
          <div className="gs-surface p-6">
            <h3 className="gs-foil font-comic text-3xl tracking-wide mb-2">
              {mode === 'MERCH' ? 'REDEEM MERCH' : 'MANUAL GATE PASS'}
            </h3>
            <p className="text-xs font-mono text-text-muted mb-4">
              {mode === 'MERCH' ? 'Enter Pass ID to claim pre-ordered items:' : 'Screen cracked or QR damaged? Type Order ID:'}
            </p>
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <input
                type="text"
                autoFocus
                placeholder="CC-7K3M9QX4"
                value={manualOrderId}
                onChange={(e) => setManualOrderId(e.target.value.toUpperCase())}
                className="gs-input w-full rounded-xl p-3 text-text font-mono text-center tracking-wider text-lg uppercase focus:outline-none"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setManualModal(false)} className="gs-metal-btn flex-1 min-h-11 rounded-xl font-comic text-lg tracking-wide">
                  CANCEL
                </button>
                <button type="submit" className="gs-launch gs-launch-sm flex-1 min-h-11 rounded-xl font-comic text-lg tracking-wide">
                  {mode === 'MERCH' ? 'CLAIM' : 'VERIFY'}
                </button>
              </div>
            </form>
          </div>
          </div>
        </div>
      )}

      {/* Full-Screen Gate Result Flash Overlay */}
      {scanResult && (
        <div
          onClick={() => {
            if (scanResult.result !== 'ENTRY_OK' && scanResult.result !== 'EXIT_OK' && scanResult.result !== 'MERCH_CLAIMED') {
              setScanResult(null);
            }
          }}
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center select-none cursor-pointer animate-in fade-in zoom-in-95 duration-100 ${
            scanResult.result === 'ENTRY_OK' || scanResult.result === 'MERCH_CLAIMED'
              ? 'bg-success text-white'
              : scanResult.result === 'EXIT_OK' || scanResult.result === 'EVACUATION_EXIT'
              ? 'bg-exit text-white'
              : scanResult.result === 'NO_CONNECTION'
              ? 'bg-zinc-700 text-white'
              : scanResult.result === 'EXIT_NOT_INSIDE' || scanResult.result === 'EXIT_NOT_NEEDED'
              ? 'bg-warning text-black'
              : scanResult.result === 'ZONE_ACCESS_DENIED'
              ? 'bg-amber-600 text-white'
              : 'bg-danger text-white'
          }`}
        >
          {scanResult.result === 'ENTRY_OK' || scanResult.result === 'MERCH_CLAIMED' ? (
            <CheckCircle2 className="w-24 h-24 mb-4 animate-bounce" />
          ) : scanResult.result === 'EXIT_OK' || scanResult.result === 'EVACUATION_EXIT' ? (
            <CheckCircle2 className="w-24 h-24 mb-4" />
          ) : scanResult.result === 'EXIT_NOT_INSIDE' || scanResult.result === 'EXIT_NOT_NEEDED' || scanResult.result === 'NO_CONNECTION' ? (
            <AlertTriangle className="w-24 h-24 mb-4" />
          ) : scanResult.result === 'ZONE_ACCESS_DENIED' ? (
            <AlertTriangle className="w-24 h-24 mb-4 animate-pulse" />
          ) : (
            <XCircle className="w-24 h-24 mb-4 animate-pulse" />
          )}

          <h1 className="font-comic text-4xl sm:text-5xl tracking-wider leading-none mb-3 drop-shadow-[2px_2px_0_#000]">
            {scanResult.result === 'ENTRY_OK'
              ? 'WELCOME! ✓'
              : scanResult.result === 'EXIT_OK'
              ? 'SEE YOU SOON ↗'
              : scanResult.result === 'MERCH_CLAIMED'
              ? 'MERCH CLAIMED! 🎁'
              : scanResult.result === 'ZONE_ACCESS_DENIED'
              ? 'ZONE RESTRICTED ⛔'
              : scanResult.result === 'ALREADY_USED_TODAY'
              ? 'ALREADY USED TODAY ✕'
              : scanResult.result === 'EXIT_NOT_NEEDED'
              ? 'NO EXIT SCAN'
              : scanResult.result === 'NO_CONNECTION'
              ? 'NO CONNECTION'
              : scanResult.result.replace(/_/g, ' ')}
          </h1>

          {scanResult.result === 'ALREADY_USED_TODAY' && (
            <div className="mb-4 w-full max-w-sm rounded-2xl border-4 border-black bg-white px-4 py-3 text-black shadow-[4px_4px_0_#000]">
              <p className="font-comic text-3xl leading-none tracking-wide">✋ CHECK HAND STAMP</p>
              <p className="mt-2 font-mono text-xs font-bold">
                First entry: {scanResult.firstEntryAt || 'earlier today'} • {scanResult.firstEntryGate || 'a gate'}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] font-bold uppercase">
                <span className="rounded-lg bg-success px-2 py-2 text-white">Today's stamp → let in</span>
                <span className="rounded-lg bg-danger px-2 py-2 text-white">No stamp → stop</span>
              </div>
            </div>
          )}

          {scanResult.holderName && (
            <p className="font-comic text-2xl sm:text-3xl uppercase tracking-wider mb-2 opacity-95">
              {scanResult.holderName}
            </p>
          )}

          <p className="font-mono text-sm max-w-sm mx-auto font-bold opacity-90 leading-relaxed mb-6">
            {scanResult.message}
          </p>

          {/* Dismiss hint for errors */}
          {scanResult.result !== 'ENTRY_OK' && scanResult.result !== 'EXIT_OK' && scanResult.result !== 'MERCH_CLAIMED' && (
            <span className="font-mono text-xs uppercase bg-black/40 px-4 py-2 rounded-full border border-white/30 tracking-widest animate-pulse">
              TAP ANYWHERE TO DISMISS
            </span>
          )}
        </div>
      )}
    </div>
  );
}
