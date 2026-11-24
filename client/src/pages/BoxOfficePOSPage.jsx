import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { ArrowLeft, ArrowRight, ArrowUpRight, Banknote, Check, CheckCircle2, ChevronRight, Clock3, CreditCard, Hash, Keyboard, Loader2, LogOut, MessageCircle, Minus, Plus, ReceiptText, RefreshCw, RotateCcw, ScanLine, ShieldCheck, Ticket, UserPlus, Users, Wallet, X, Zap, AlertCircle } from 'lucide-react';
import { toPaise, formatMoney } from '../utils/pos';
import ShiftBar from '../components/pos/ShiftBar';
import './BoxOfficePOSPage.css';

const ticketsLabel = n => `${n} ${n === 1 ? 'ticket' : 'tickets'}`;
const timeLabel = value => new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const isMobile = value => /^[6-9]\d{9}$/.test(value || '');
const dateLabel = value => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export default function BoxOfficePOSPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [summary, setSummary] = useState(null);
  const [syncing, setSyncing] = useState(true);
  const [syncError, setSyncError] = useState('');
  const [syncedAt, setSyncedAt] = useState(null);
  const [mode, setMode] = useState('token');
  const [tokenInput, setTokenInput] = useState('');
  const [activeToken, setActiveToken] = useState(null);
  const [guest, setGuest] = useState({ name: '', phone: '' });
  const [guestNames, setGuestNames] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [tierId, setTierId] = useState('general');
  const [extras, setExtras] = useState({});
  const [cash, setCash] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [waPhone, setWaPhone] = useState('');
  const [waBusy, setWaBusy] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [notice, setNotice] = useState(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const tokenRef = useRef(null);
  const nameRef = useRef(null);
  const cashRef = useRef(null);
  const dialogRef = useRef(null);
  const pending = useRef(false);
  const refreshing = useRef(false);
  const requestId = useRef(null);
  const noticeTimer = useRef(null);

  const notify = (message, type = 'success') => {
    clearTimeout(noticeTimer.current);
    setNotice({ message, type });
    noticeTimer.current = setTimeout(() => setNotice(null), 6500);
  };
  const logout = () => {
    api.staffLogout().catch(() => {});
    localStorage.removeItem('cc_staff_user');
    navigate('/staff', { replace: true });
  };
  const handleError = err => {
    if (err.status === 401) { logout(); return; }
    setError(err.message || 'Unable to complete this request. Please try again.');
  };
  const refresh = async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    setSyncing(true);
    try {
      const [nextConfig, nextSummary] = await Promise.all([api.posConfig(), api.posShiftSummary()]);
      setConfig(nextConfig);
      setSummary(nextSummary);
      setLastSale(nextSummary.recentSales?.[0] || null);
      setSyncedAt(Date.now());
      setSyncError('');
    } catch (err) {
      if (err.status === 401) logout();
      else setSyncError(err.message || 'Could not refresh counter data.');
    } finally {
      refreshing.current = false;
      setSyncing(false);
    }
  };

  useEffect(() => {
    document.title = 'Box Office POS — FlashPass';
    if (!localStorage.getItem('cc_staff_user')) { navigate('/staff', { replace: true }); return; }
    let mounted = true;
    api.getMe().then(staff => {
      if (!mounted) return;
      if (!['CASHIER', 'SUPER_ADMIN'].includes(staff.role)) { navigate('/staff', { replace: true }); return; }
      setUser(staff);
      refresh();
    }).catch(err => {
      if (!mounted) return;
      if (err.status === 401 || err.status === 403) logout();
      else { setSyncError('Could not verify your staff session. Reload to reconnect.'); setSyncing(false); }
    });
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { mounted = false; clearInterval(clock); clearTimeout(noticeTimer.current); };
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    const timer = setInterval(() => { if (!pending.current && document.visibilityState === 'visible') refresh(); }, 60000);
    return () => clearInterval(timer);
  }, [user]);

  useEffect(() => {
    if (undoOpen) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [undoOpen]);

  // Older servers send no categories: fall back to the single admin cash price.
  const tiers = config?.tiers?.length ? config.tiers : config ? [{ ...config, tierId: 'general', name: 'General admission', remaining: null }] : [];
  const catalog = config?.addOns || [];
  const extraLines = receipt ? receipt.addOns || [] : mode !== 'walkin' ? [] : Object.entries(extras).flatMap(([key, count]) => {
    const [addOnId, variant] = key.split('::');
    const item = catalog.find(a => a.addOnId === addOnId);
    return item && count > 0 ? [{ addOnId, variant: variant || undefined, quantity: count, name: item.name, pricePaise: item.pricePaise }] : [];
  });
  const extrasPaise = extraLines.reduce((sum, line) => sum + line.pricePaise * line.quantity, 0);
  const extraCount = addOnId => extraLines.filter(line => line.addOnId === addOnId).reduce((sum, line) => sum + line.quantity, 0);
  const changeExtra = (key, delta) => setExtras(current => ({ ...current, [key]: Math.max(0, (current[key] || 0) + delta) }));
  const tier = tiers.find(t => t.tierId === tierId) || tiers[0];
  const tierSoldOut = tier?.remaining === 0;
  const pricing = receipt?.pricing || (mode === 'walkin' ? tier || config : activeToken || config);
  // A token is paid at the general price, so its group is limited by what general has left.
  const saleTier = mode === 'walkin' ? tier : tiers.find(t => t.tierId === 'general');
  const maxTickets = Math.max(1, Math.min(config?.maxWalkinTickets || 5, saleTier?.remaining ?? Infinity));
  const saleQuantity = receipt ? receipt.quantity || 1 : mode === 'walkin' || activeToken ? quantity : 1;
  const sentGuestNames = () => (quantity > 1 ? Array.from({ length: quantity }, (_, i) => (guestNames[i] || '').trim()) : []);
  // Ticket count and one optional name box per guest; shared by walk-in and token sales.
  const groupFields = buyerName => <>
    <label htmlFor="pos-quantity">Number of tickets <span>up to {maxTickets}</span></label>
    <div className="pos-quantity"><button type="button" aria-label="One less ticket" disabled={Boolean(busy) || quantity <= 1} onClick={() => setQuantity(quantity - 1)}><Minus size={18} /></button><output id="pos-quantity" aria-live="polite"><Users size={17} /> {ticketsLabel(quantity)}</output><button type="button" aria-label="One more ticket" disabled={Boolean(busy) || quantity >= maxTickets} onClick={() => setQuantity(quantity + 1)}><Plus size={18} /></button></div>
    {quantity > 1 && <>
      <span className="pos-field-label pos-extras-label" id="pos-guest-names-label">Name on each ticket <span>optional</span></span>
      <div className="pos-guest-names" role="group" aria-labelledby="pos-guest-names-label">{Array.from({ length: quantity }, (_, i) => <div className="pos-guest-name-row" key={i}>
        <span aria-hidden="true">{i + 1}</span>
        <input form="pos-payment-form" aria-label={`Name on ticket ${i + 1}`} placeholder={`${buyerName} (${i + 1}/${quantity})`} autoComplete="off" maxLength={60} value={guestNames[i] || ''} disabled={Boolean(busy)} onChange={e => setGuestNames(names => { const next = [...names]; next[i] = e.target.value; return next; })} />
      </div>)}</div>
      <p className="pos-guest-names-help">Leave a box blank to use the name shown in it.</p>
    </>}
  </>;
  const amount = Number.isSafeInteger(pricing?.amountPaise) ? pricing.amountPaise * saleQuantity + extrasPaise : undefined;
  const cashPaise = toPaise(cash);
  const tokenExpired = activeToken && new Date(activeToken.token.expiresAt).getTime() <= now;
  const ready = Boolean(user && config?.salesOpen && !syncError && !receipt && (mode === 'walkin' ? Boolean(tier) && !tierSoldOut : activeToken && !tokenExpired));
  const phoneValid = !guest.phone || /^[6-9]\d{9}$/.test(guest.phone);
  const sufficientCash = cashPaise !== null && Number.isSafeInteger(amount) && cashPaise >= amount;
  const canConfirm = ready && sufficientCash && (mode !== 'walkin' || phoneValid) && !busy;
  const undoUntil = lastSale ? (lastSale.undoUntil ? new Date(lastSale.undoUntil).getTime() : new Date(lastSale.paidAt).getTime() + 30000) : 0;
  const undoSeconds = Math.max(0, Math.ceil((undoUntil - now) / 1000));
  const canUndo = Boolean(lastSale && undoSeconds > 0 && !busy);
  const recent = summary?.recentSales || [];

  // Copies the pass image (with QR) to the clipboard, then opens the buyer's chat in the
  // cashier's own WhatsApp with a message typed in. WhatsApp links cannot carry files, so
  // the cashier presses Ctrl+V in the chat and sends the image. A group sale saves one
  // picture per guest instead, for the cashier to attach together.
  const sendWhatsApp = async () => {
    if (!receipt || !isMobile(waPhone) || waBusy) return;
    const count = receipt.quantity || 1;
    // In a group the first pass may carry another guest's name, so greet the buyer.
    const name = (count > 1 ? receipt.token?.holderName || guest.name.trim() : receipt.pass?.holderName) || 'there';
    const passes = (receipt.passes?.length ? receipt.passes : [receipt.pass])
      .map(p => (p.orderId === receipt.pass?.orderId ? { ...p, ...receipt.pass } : p));
    if (passes.some(p => !p.qrToken)) {
      notify('Could not load the QR codes for this sale. Open the ticket and share it from there.', 'error');
      return;
    }
    const text = [
      `Hi ${name}! Your ${count > 1 ? `${count} tickets` : 'ticket'} for ${config?.eventName || 'the event'} ${count > 1 ? 'are' : 'is'} ready. Show the QR at the gate.`,
      '',
      `Open ${count > 1 ? 'them' : 'it'} any time here: ${window.location.origin}/pass/${receipt.orderId}`,
      `Order ID: ${receipt.orderId}`
    ].join('\n');
    setWaBusy(true);
    const imageModule = import('../utils/exportPass');
    // The pictures name the event this counter sells for.
    const saleEvent = { name: config?.eventName, venue: config?.venue, eventDays: config?.eventDays };
    if (passes.length > 1) {
      // A clipboard holds one image, so a group gets one named picture per guest in Downloads.
      // The cashier selects them all in the chat's attach menu and sends them together.
      // Each file is named after the guest on that pass, so the buyer knows whom to forward it to.
      const fileName = p => String(p.holderName || 'Guest').replace(/\(\d+\/\d+\)/, '').trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'Guest';
      let saved = 0;
      try {
        const { passImageBlob } = await imageModule;
        for (let i = 0; i < passes.length; i++) {
          const url = URL.createObjectURL(await passImageBlob(passes[i], i, passes.length, saleEvent));
          const link = document.createElement('a');
          link.href = url;
          link.download = `FlashPass_${i + 1}-of-${passes.length}_${fileName(passes[i])}.png`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
          saved++;
          // Browsers drop downloads started in the same instant.
          if (i < passes.length - 1) await new Promise(resolve => setTimeout(resolve, 250));
        }
      } catch { /* the message still carries the ticket link */ }
      window.open(`https://wa.me/91${waPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      notify(saved === passes.length
        ? `${saved} ticket pictures saved to Downloads, one per guest. Attach all ${saved} in the WhatsApp chat, then Send.`
        : 'Could not save every ticket picture. The message has the ticket link; open the tickets to share the rest.', saved === passes.length ? 'success' : 'error');
      setWaBusy(false);
      return;
    }
    const image = imageModule.then(({ passImageBlob }) => passImageBlob(passes[0], 0, 1, saleEvent));
    let copied = false;
    try {
      // The clipboard must be written while this tab still has focus, so before WhatsApp opens.
      // Handing ClipboardItem a promise keeps the click's permission while the image is drawn.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })]);
      copied = true;
    } catch {
      // No image clipboard in this browser: save the image so it can be attached instead.
      try {
        const url = URL.createObjectURL(await image);
        const link = document.createElement('a');
        link.href = url;
        link.download = `FlashPass_${receipt.orderId}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } catch { /* the message still carries the ticket link */ }
    }
    window.open(`https://wa.me/91${waPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    notify(copied
      ? `Ticket image copied. In the WhatsApp chat press Ctrl+V, then Send.`
      : `Ticket image downloaded. Attach it in the WhatsApp chat, then Send.`, copied ? 'success' : 'error');
    setWaBusy(false);
  };

  useEffect(() => { if (quantity > maxTickets) setQuantity(maxTickets); }, [quantity, maxTickets]);

  const reset = (nextMode = mode) => {
    if (pending.current) return;
    setMode(nextMode);
    setTokenInput('');
    setActiveToken(null);
    setGuest({ name: '', phone: '' });
    setGuestNames([]);
    setQuantity(1);
    setTierId('general');
    setExtras({});
    setCash('');
    setError('');
    setReceipt(null);
    setWaPhone('');
    requestId.current = null;
    requestAnimationFrame(() => (nextMode === 'token' ? tokenRef : nameRef).current?.focus());
  };

  const lookup = async e => {
    e?.preventDefault();
    if (pending.current || !config?.salesOpen || syncError) return;
    const match = tokenInput.trim().match(/^(?:C-)?(\d+)$/i);
    if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) { setError('Enter a token number such as 142 or C-142.'); return; }
    pending.current = true;
    setBusy('lookup');
    setError('');
    setActiveToken(null);
    setCash('');
    // Each token starts as one ticket; the cashier adds friends paying with it.
    setQuantity(1);
    setGuestNames([]);
    try {
      const data = await api.posLookupToken(match[1]);
      setActiveToken(data);
      requestAnimationFrame(() => cashRef.current?.focus());
    } catch (err) { handleError(err); }
    finally { pending.current = false; setBusy(''); }
  };

  const confirm = async e => {
    e?.preventDefault();
    if (pending.current || !canConfirm) return;
    pending.current = true;
    setBusy('confirm');
    setError('');
    try {
      let result;
      if (mode === 'walkin') {
        if (!requestId.current) requestId.current = crypto.randomUUID();
        result = await api.posWalkin({
          name: guest.name.trim() || 'Walk-in Guest', phone: guest.phone, quantity, tierId: tier.tierId,
          guestNames: sentGuestNames(),
          addOns: extraLines.map(({ addOnId, variant, quantity: count }) => ({ addOnId, variant, quantity: count })),
          cashTenderedPaise: cashPaise, expectedAmountPaise: amount, requestId: requestId.current
        });
      } else {
        result = await api.posConfirmToken(activeToken.token.tokenNo, cashPaise, amount, quantity, sentGuestNames());
      }
      setReceipt({ ...result, pricing: { ...pricing } });
      const buyerPhone = String(result.pass?.phone || '').replace(/\D/g, '').slice(-10);
      setWaPhone(isMobile(buyerPhone) ? buyerPhone : '');
      setLastSale(result);
      setNow(Date.now());
      setActiveToken(null);
      setCash('');
      setTokenInput('');
      requestId.current = null;
      refresh();
    } catch (err) {
      handleError(err);
      if (['PRICE_CHANGED', 'SALES_CLOSED', 'TOKEN_UNAVAILABLE', 'SALE_IN_PROGRESS', 'INVALID_TIER', 'SOLD_OUT', 'INVALID_ADDONS', 'ADDON_SOLD_OUT'].includes(err.code)) {
        setActiveToken(null);
        setCash('');
        refresh();
      }
    } finally { pending.current = false; setBusy(''); }
  };

  const undo = async () => {
    if (pending.current || !canUndo) return;
    pending.current = true;
    setBusy('undo');
    try {
      const result = await api.posUndo(lastSale.orderId);
      notify(`Sale reversed${result.quantity > 1 ? ` (${ticketsLabel(result.quantity)})` : ''}. Return ${formatMoney(result.refundPaise)} to the guest.`);
      setLastSale(null);
      setReceipt(null);
      setUndoOpen(false);
      setError('');
      refresh();
    } catch (err) {
      setUndoOpen(false);
      notify(err.message || 'Unable to reverse this sale.', 'error');
      refresh();
    } finally { pending.current = false; setBusy(''); }
  };

  useEffect(() => {
    const onKey = e => {
      if (e.repeat || pending.current) return;
      if (undoOpen) return;
      const editable = e.target instanceof HTMLElement && (e.target.matches('input, textarea, select') || e.target.isContentEditable);
      if (e.key === 'F2') { e.preventDefault(); reset('walkin'); }
      else if (e.key === 'F9') { e.preventDefault(); refresh(); }
      else if (e.key === 'Escape') { e.preventDefault(); reset(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !editable) {
        if (canUndo) { e.preventDefault(); setUndoOpen(true); }
      } else if (e.code === 'Space' && !e.ctrlKey && !e.metaKey && !e.altKey && (e.target === cashRef.current || (!editable && !e.target.closest('button, a')))) {
        e.preventDefault();
        if (canConfirm) confirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="pos-app">
      <header className="pos-topbar">
        <div className="pos-brand"><span className="pos-brand-icon"><Zap size={21} fill="currentColor" /></span><span>flashpass<span className="pos-brand-dot">.</span></span><span className="pos-brand-divider" /><span className="pos-workspace-label">STAFF WORKSPACE</span></div>
        <div className="pos-account"><span className="pos-date">{dateLabel(now)}</span><span className="pos-avatar">{user?.name?.charAt(0) || 'C'}</span><div className="pos-account-name"><strong>{user?.name || 'Connecting…'}</strong><span>Box office cashier</span></div><button type="button" className="pos-icon-button" onClick={logout} disabled={Boolean(busy)} aria-label="Sign out"><LogOut size={17} /></button></div>
      </header>

      <main className="pos-main">
        <div className="pos-breadcrumb"><button type="button" disabled={Boolean(busy)} onClick={() => navigate('/')}><ArrowLeft size={13} /> Home</button><ChevronRight size={12} /><span>Box office</span></div>
        <section className="pos-page-heading">
          <div><div className="pos-eyebrow">POINT OF SALE</div><h1>Box office<span>.</span></h1><p>A smooth check-in starts with a simple checkout.</p></div>
          <div className="pos-event"><span className={`pos-status-dot ${!config?.salesOpen || syncError ? 'is-offline' : ''}`} /><div><strong>{config?.eventName || 'Loading your counter'}</strong><span>{syncError ? 'Connection needs attention' : config ? config.salesOpen ? 'Cash counter open' : 'Cash sales paused' : 'Connecting to the counter…'}</span></div></div>
        </section>

        {syncError && <div className="pos-alert" role="alert"><AlertCircle size={17} /><span>{syncError} Sales are paused until counter data refreshes.</span><button type="button" onClick={refresh} disabled={syncing || !user}>Retry</button></div>}
        {config && !config.salesOpen && <div className="pos-alert" role="status"><AlertCircle size={17} /><span>{config.salesReason || 'Cash sales are currently closed.'}</span></div>}

        <section className="pos-stats" aria-label="Your counter this shift">
          <div className="pos-stat"><span className="pos-stat-icon"><Wallet size={19} /></span><div><span>Cash collected this shift</span><strong>{summary ? formatMoney(summary.totalCashPaise) : '—'}</strong></div><span className="pos-stat-tag">YOUR COUNTER</span></div>
          <div className="pos-stat"><span className="pos-stat-icon"><Ticket size={19} /></span><div><span>Tickets issued this shift</span><strong>{summary ? String(summary.ticketCount).padStart(2, '0') : '—'}<small>paid {summary?.ticketCount === 1 ? 'ticket' : 'tickets'}</small></strong></div></div>
          <div className="pos-stat"><span className="pos-stat-icon"><CreditCard size={19} /></span><div><span>Current cash ticket</span><strong>{config ? formatMoney(config.amountPaise) : '—'}<small>per guest</small></strong></div><span className="pos-price-note">From admin pricing</span></div>
        </section>

        <ShiftBar shift={summary?.shift} disabled={Boolean(busy) || syncing} onChanged={refresh} />

        <div className="pos-counter-grid">
          <section className="pos-panel pos-sale-panel" aria-labelledby="new-sale-title">
            <div className="pos-panel-heading"><div className="pos-title-with-icon"><span className="pos-section-number">01</span><div><h2 id="new-sale-title">Start a sale</h2><p>Choose how your guest is checking in.</p></div></div><span className="pos-small-label">CASH PAYMENT</span></div>
            <div className="pos-mode-switch" aria-label="Sale type">
              <button type="button" aria-pressed={mode === 'token'} className={mode === 'token' ? 'is-active' : ''} onClick={() => reset('token')} disabled={Boolean(busy)}><ScanLine size={17} /> Collect a token</button>
              <button type="button" aria-pressed={mode === 'walkin'} className={mode === 'walkin' ? 'is-active' : ''} onClick={() => reset('walkin')} disabled={Boolean(busy)}><UserPlus size={17} /> New walk-in <kbd>F2</kbd></button>
            </div>

            {receipt ? <div className="pos-receipt" role="status">
              <div className="pos-success-icon"><Check size={30} /></div><span className="pos-eyebrow">PAYMENT COMPLETE</span><h3>You're all set.</h3><p>{receipt.quantity > 1 ? <><strong>{receipt.quantity} tickets</strong> issued for <strong>{receipt.token?.holderName || guest.name.trim() || 'Walk-in Guest'}</strong>'s group{receipt.tierName ? ` (${receipt.tierName})` : ''}. Each guest has their own QR.</> : <>A ticket has been issued to <strong>{receipt.pass.holderName}</strong>.</>}</p>
              {receipt.addOns?.length > 0 && <p className="pos-receipt-extras">Extras: {receipt.addOns.map(line => `${line.name}${line.variant ? ` (${line.variant})` : ''} ×${line.quantity}`).join(', ')}. The guest collects them by showing their pass QR.</p>}
              <div className="pos-receipt-details"><span>Order reference<strong>{receipt.orderId}</strong></span><span>Change to return<strong>{formatMoney(Math.round(Number(receipt.changeRupees) * 100))}</strong></span></div>
              <div className="pos-receipt-whatsapp">
                <label htmlFor="pos-wa-phone">Send ticket on WhatsApp</label>
                <div className="pos-lookup-row"><div className="pos-phone-input"><span>+91</span><input id="pos-wa-phone" type="tel" inputMode="numeric" placeholder="10-digit mobile number" autoComplete="off" maxLength={10} value={waPhone} aria-invalid={Boolean(waPhone) && !isMobile(waPhone)} onChange={e => setWaPhone(e.target.value.replace(/\D/g, ''))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sendWhatsApp(); } }} /></div><button type="button" className="pos-button pos-button-secondary" disabled={!isMobile(waPhone) || waBusy} onClick={sendWhatsApp}>{waBusy ? <Loader2 size={16} className="pos-spin" /> : <MessageCircle size={16} />} Send ticket on WhatsApp</button></div>
                {waPhone && !isMobile(waPhone) && <p className="pos-field-error">Enter 10 digits starting with 6, 7, 8 or 9.</p>}
                {receipt.quantity > 1 ? <ol className="pos-wa-steps">
                  <li>Check the buyer's number and click <strong>Send ticket on WhatsApp</strong>. One picture per guest ({receipt.quantity} in all, each named after its guest) is saved to Downloads.</li>
                  <li>The buyer's chat opens with a message. Click the attach (<strong>+</strong>) button, choose <strong>Photos &amp; videos</strong>, and select all {receipt.quantity} <strong>FlashPass_…</strong> pictures in Downloads.</li>
                  <li>Tap <strong>Send</strong>. The buyer can forward each guest their own picture.</li>
                </ol> : <ol className="pos-wa-steps">
                  <li>Check the guest's number and click <strong>Send ticket on WhatsApp</strong>.</li>
                  <li>The guest's chat opens with a message. Click in the message box and press <kbd>Ctrl</kbd>+<kbd>V</kbd> to add the ticket picture with the QR (on a phone: press and hold, then Paste).</li>
                  <li>Tap <strong>Send</strong>. If nothing pastes, attach the ticket picture from Downloads.</li>
                </ol>}
              </div>
              <div className="pos-receipt-actions"><a className="pos-button pos-button-secondary" href={`/pass/${receipt.orderId}`} target="_blank" rel="noreferrer"><Ticket size={16} /> {receipt.quantity > 1 ? `Open all ${receipt.quantity} tickets` : 'Open ticket'} <ArrowUpRight size={15} /></a><button type="button" className="pos-button pos-button-primary" onClick={() => reset()}>Next guest <ArrowRight size={16} /></button></div>
            </div> : <>
              {mode === 'token' ? <>
                <form onSubmit={lookup} className="pos-token-form"><label htmlFor="pos-token">Guest's token number</label><div className="pos-lookup-row"><div className="pos-token-input"><Hash size={20} /><input id="pos-token" ref={tokenRef} autoFocus inputMode="text" autoComplete="off" placeholder="e.g. C-142" maxLength={20} value={tokenInput} disabled={Boolean(busy)} onChange={e => { setTokenInput(e.target.value); setActiveToken(null); setCash(''); setError(''); }} /></div><button type="submit" className="pos-button pos-button-primary" disabled={Boolean(busy) || !tokenInput.trim() || !config?.salesOpen || Boolean(syncError)}>{busy === 'lookup' ? <Loader2 size={17} className="pos-spin" /> : <ScanLine size={17} />} Find token <kbd>↵</kbd></button></div><p>Enter the number shown on the guest's cash token.</p></form>
                {activeToken ? <div className="pos-found-ticket">
                  <div className="pos-ticket-top"><span><Ticket size={17} /> {activeToken.token.display}</span><span className={`pos-pill ${tokenExpired ? 'is-warning' : ''}`}>{tokenExpired ? 'Expired' : 'Ready to collect'}</span></div>
                  <h3>{activeToken.token.holderName}</h3><p>{activeToken.maskedPhone}</p>
                  <div className="pos-ticket-bottom"><span>{activeToken.badge || config?.badge || 'Event admission'}</span><span><Clock3 size={13} /> {tokenExpired ? 'Request a new token' : `Expires at ${timeLabel(activeToken.token.expiresAt)}`}</span></div>
                  {!tokenExpired && <div className="pos-token-group">{groupFields(activeToken.token.holderName)}</div>}
                </div> : <div className="pos-empty-state"><div className="pos-ticket-art" aria-hidden="true"><span className="pos-art-lines"><i /><i /><i /></span><Ticket size={34} strokeWidth={1.25} /><span className="pos-art-dots" /></div><h3>One token. One great experience.</h3><p>Find a guest's token to review their details<br />and collect their payment.</p><div className="pos-flow"><span><span>1</span> Find token</span><ChevronRight size={12} /><span><span>2</span> Collect cash</span><ChevronRight size={12} /><span><span>3</span> Issue ticket</span></div></div>}
              </> : <div className="pos-walkin">
                <div className="pos-walkin-intro"><UserPlus size={20} /><div><strong>No token? No problem.</strong><p>Issue a ticket directly to a guest at the counter.</p></div></div>
                <span className="pos-field-label" id="pos-tier-label">Ticket category <span>{tiers.length} on sale</span></span>
                <div className="pos-tiers" role="radiogroup" aria-labelledby="pos-tier-label">{tiers.map(t => <button type="button" role="radio" key={t.tierId} aria-checked={t.tierId === tier?.tierId} className={t.tierId === tier?.tierId ? 'is-active' : ''} disabled={Boolean(busy) || t.remaining === 0} onClick={() => setTierId(t.tierId)}><strong>{t.name}</strong><span>{formatMoney(t.amountPaise)}</span><small>{t.remaining === 0 ? 'Sold out' : t.remaining !== null && t.remaining <= 50 ? `${t.remaining} left` : t.customerFeePaise ? `incl. ${formatMoney(t.customerFeePaise)} fee` : 'Fee included'}</small></button>)}</div>
                <label htmlFor="pos-guest-name">Guest name <span>optional</span></label><input id="pos-guest-name" ref={nameRef} form="pos-payment-form" placeholder="Walk-in Guest" autoComplete="off" maxLength={60} value={guest.name} disabled={Boolean(busy)} onChange={e => setGuest({ ...guest, name: e.target.value })} />
                <label htmlFor="pos-guest-phone">Mobile number <span>optional</span></label><div className="pos-phone-input"><span>+91</span><input id="pos-guest-phone" form="pos-payment-form" type="tel" inputMode="numeric" placeholder="10-digit mobile number" autoComplete="off" maxLength={10} aria-invalid={!phoneValid} aria-describedby={!phoneValid ? 'pos-phone-error' : undefined} value={guest.phone} disabled={Boolean(busy)} onChange={e => setGuest({ ...guest, phone: e.target.value.replace(/\D/g, '') })} /></div>
                {!phoneValid && <p id="pos-phone-error" className="pos-field-error">Enter 10 digits starting with 6, 7, 8 or 9, or leave this blank.</p>}
                {groupFields(guest.name.trim() || 'Walk-in Guest')}
                {catalog.length > 0 && <>
                  <span className="pos-field-label pos-extras-label">Extras <span>optional</span></span>
                  <div className="pos-extras">{catalog.map(item => {
                    const left = item.remaining - extraCount(item.addOnId);
                    return <div className="pos-extra" key={item.addOnId}>
                      <div className="pos-extra-head"><strong>{item.name}</strong><span>{formatMoney(item.pricePaise)}</span><small>{item.remaining === 0 ? 'Sold out' : left <= 20 ? `${left} left` : item.category.replace('_', ' ').toLowerCase()}</small></div>
                      <div className="pos-extra-options">{(item.variants.length ? item.variants : ['']).map(variant => {
                        const key = `${item.addOnId}::${variant}`;
                        const count = extras[key] || 0;
                        return <div className={`pos-mini-step ${count ? 'is-active' : ''}`} key={key}>{variant && <span>{variant}</span>}<button type="button" aria-label={`Remove one ${item.name} ${variant}`} disabled={Boolean(busy) || !count} onClick={() => changeExtra(key, -1)}><Minus size={13} /></button><output aria-label={`${item.name} ${variant} quantity`}>{count}</output><button type="button" aria-label={`Add one ${item.name} ${variant}`} disabled={Boolean(busy) || left <= 0 || count >= 20} onClick={() => changeExtra(key, 1)}><Plus size={13} /></button></div>;
                      })}</div>
                    </div>;
                  })}</div>
                </>}
                <div className="pos-info-note"><ShieldCheck size={16} /><p>{quantity > 1 ? `Each of the ${quantity} guests gets their own QR pass. Open the tickets after payment to print or share them.` : "One admission per ticket. Open the ticket after payment to print or save the guest's pass."}</p></div>
              </div>}
              {error && <div className="pos-inline-error" role="alert"><AlertCircle size={17} /><span>{error}</span></div>}
            </>}
            <div className="pos-sale-footer"><span><ShieldCheck size={14} /> Tickets activate after cash confirmation</span><button type="button" onClick={() => reset()} disabled={Boolean(busy)}>Clear sale <kbd>Esc</kbd></button></div>
          </section>

          <section className="pos-panel pos-payment-panel" aria-labelledby="payment-title">
            <div className="pos-panel-heading"><div className="pos-title-with-icon"><span className="pos-section-number">02</span><div><h2 id="payment-title">Payment summary</h2><p>{receipt ? 'Payment recorded successfully.' : ready ? 'Review the amount, then collect cash.' : 'Your next checkout, ready when you are.'}</p></div></div><ReceiptText size={19} className="pos-muted" /></div>
            <form id="pos-payment-form" onSubmit={confirm}>
              <div className="pos-line-items"><div><span>{pricing?.name || 'General admission'} <small>× {saleQuantity}</small></span><span>{pricing ? formatMoney(pricing.basePricePaise * saleQuantity) : '—'}</span></div><div><span>Booking fee</span><span>{pricing ? pricing.customerFeePaise ? formatMoney(pricing.customerFeePaise * saleQuantity) : 'Included' : '—'}</span></div>{extraLines.map(line => <div key={`${line.addOnId}::${line.variant || ''}`}><span>{line.name}{line.variant ? ` (${line.variant})` : ''} <small>× {line.quantity}</small></span><span>{formatMoney(line.pricePaise * line.quantity)}</span></div>)}</div>
              <div className="pos-total"><span>Total to collect</span><strong>{pricing ? formatMoney(amount) : '—'}</strong></div>
              <label htmlFor="pos-cash">Cash received <span>INR</span></label>
              <div className={`pos-cash-input ${cash && !sufficientCash ? 'has-error' : ''}`}><span>₹</span><input ref={cashRef} id="pos-cash" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={cash} disabled={!ready || Boolean(busy)} onChange={e => { if (/^\d{0,8}(\.\d{0,2})?$/.test(e.target.value)) setCash(e.target.value); }} aria-invalid={Boolean(cash && !sufficientCash)} aria-describedby="pos-cash-help" /><Banknote size={20} /></div>
              <div className="pos-quick-cash"><button type="button" disabled={!ready || Boolean(busy)} onClick={() => setCash((amount / 100).toFixed(2))}>Exact amount</button>{[100, 200, 500, 1000, 2000, 5000].filter(value => value * 100 >= (amount || 0)).slice(0, 3).map(value => <button type="button" key={value} disabled={!ready || Boolean(busy)} onClick={() => setCash(String(value))}>₹{value}</button>)}</div>
              <div className={`pos-change ${ready && sufficientCash ? 'is-ready' : ''}`}><div><RotateCcw size={15} /><span>Change to return</span></div><strong>{receipt ? formatMoney(Math.round(Number(receipt.changeRupees) * 100)) : ready && sufficientCash ? formatMoney(cashPaise - amount) : '₹0.00'}</strong></div>
              <p id="pos-cash-help" className={`pos-payment-help ${cash && !sufficientCash ? 'pos-field-error' : ''}`}>{receipt ? 'Open the ticket or start the next sale.' : !ready ? 'Select a walk-in or find a token to continue.' : !cash ? 'Enter the cash received or choose an amount above.' : !sufficientCash ? `Collect ${formatMoney(Math.max(0, amount - (cashPaise || 0)))} more to continue.` : 'Return the change shown above to your guest.'}</p>
              <button type="submit" className="pos-button pos-button-primary pos-confirm" disabled={!canConfirm}>{busy === 'confirm' ? <Loader2 size={18} className="pos-spin" /> : receipt ? <CheckCircle2 size={18} /> : <Check size={18} />}{busy === 'confirm' ? 'Issuing ticket…' : receipt ? 'Ticket issued' : saleQuantity > 1 ? `Confirm cash & issue ${saleQuantity} tickets` : 'Confirm cash & issue ticket'}{!receipt && <ArrowRight size={17} />}</button>
              <div className="pos-confirm-note"><ShieldCheck size={12} /> Confirm only after receiving cash</div>
            </form>
          </section>
        </div>

        <div className="pos-bottom-grid">
          <section className="pos-panel pos-activity" aria-labelledby="recent-title">
            <div className="pos-panel-heading"><div className="pos-title-with-icon"><ReceiptText size={18} /><h2 id="recent-title">Recent tickets <span className="pos-count">{recent.length}</span></h2></div><button type="button" className="pos-text-button" onClick={refresh} disabled={syncing || Boolean(busy) || !user}><RefreshCw size={13} className={syncing ? 'pos-spin' : ''} /> Refresh</button></div>
            {recent.length ? <div className="pos-sales-table"><div className="pos-table-head"><span>GUEST / ORDER</span><span>TYPE</span><span>TIME</span><span>AMOUNT</span><span /></div>{recent.map(sale => <a key={sale.orderId} className="pos-sale-row" href={`/pass/${sale.orderId}`} target="_blank" rel="noreferrer" aria-label={`Open ticket ${sale.orderId} for ${sale.holderName}`}><div className="pos-sale-guest"><span className="pos-sale-avatar">{sale.holderName?.charAt(0) || 'G'}</span><span><strong>{sale.holderName}</strong><small>{sale.orderId}{sale.tierName ? ` · ${sale.tierName}` : ''}</small></span></div><span className="pos-sale-type">{sale.channel === 'CASH_TOKEN' ? 'Token' : 'Walk-in'}{sale.quantity > 1 ? ` ×${sale.quantity}` : ''}</span><span className="pos-sale-time">{timeLabel(sale.paidAt)}</span><strong className="pos-sale-amount">{formatMoney(sale.amountPaise)}</strong><ArrowUpRight size={14} /></a>)}</div> : <div className="pos-empty-sales"><ReceiptText size={23} /><div><strong>{syncing ? 'Loading today’s tickets…' : 'A fresh start to the day.'}</strong><p>Your completed sales will appear here.</p></div></div>}
            <div className="pos-activity-footer"><span>Latest 5 paid tickets · Your counter · Today (IST)</span><span className="pos-sync-label">{syncedAt ? `Updated ${timeLabel(syncedAt)}` : 'Waiting for data'}</span></div>
          </section>

          <aside className="pos-side-tools">
            <section className="pos-undo-card"><div><span className="pos-tool-icon"><RotateCcw size={18} /></span><div><h3>Need to correct a sale?</h3><p>{canUndo ? `${lastSale.orderId} · ${undoSeconds}s remaining` : 'Undo an unused ticket within 30 seconds.'}</p></div></div><button type="button" className="pos-button pos-button-secondary" disabled={!canUndo} onClick={() => setUndoOpen(true)}><RotateCcw size={14} /> Undo last sale <span>{canUndo ? `${undoSeconds}s` : <kbd>Ctrl Z</kbd>}</span></button></section>
            <section className="pos-shortcuts"><h3><Keyboard size={16} /> A little faster, every time</h3><div><span>Find token</span><kbd>Enter</kbd></div><div><span>Confirm cash</span><kbd>Space</kbd></div><div><span>New walk-in</span><kbd>F2</kbd></div><div><span>Clear sale</span><kbd>Esc</kbd></div><div><span>Refresh counter</span><kbd>F9</kbd></div></section>
          </aside>
        </div>
        <footer className="pos-footer"><span><Zap size={12} /> Powered by FlashPass</span><span>Less waiting. More experiencing.</span><span>All amounts in INR · Times in IST</span></footer>
      </main>

      <dialog ref={dialogRef} className="pos-undo-dialog" aria-labelledby="pos-undo-title" onCancel={e => { if (pending.current) e.preventDefault(); else setUndoOpen(false); }}>
        <div className="pos-dialog-heading"><span className="pos-tool-icon"><RotateCcw size={21} /></span><button type="button" className="pos-icon-button" aria-label="Close undo dialog" disabled={Boolean(busy)} onClick={() => setUndoOpen(false)}><X size={18} /></button></div>
        <h2 id="pos-undo-title">Reverse this sale?</h2><p>{lastSale?.quantity > 1 ? `All ${lastSale.quantity} tickets` : 'The ticket'} for <strong>{lastSale?.orderId}</strong> will be cancelled. Return <strong>{formatMoney(lastSale?.amountPaise || 0)}</strong> to the guest.</p>
        <div className="pos-dialog-timer"><Clock3 size={15} /> {undoSeconds > 0 ? `${undoSeconds} seconds left to undo` : 'The undo window has ended.'}</div>
        <div className="pos-dialog-actions"><button type="button" className="pos-button pos-button-secondary" disabled={Boolean(busy)} onClick={() => setUndoOpen(false)}>Keep ticket</button><button type="button" className="pos-button pos-button-danger" disabled={!canUndo} onClick={undo}>{busy === 'undo' ? 'Reversing…' : 'Reverse sale'}</button></div>
      </dialog>
      {notice && <div className={`pos-toast ${notice.type === 'error' ? 'is-error' : ''}`} role={notice.type === 'error' ? 'alert' : 'status'}>{notice.type === 'error' ? <AlertCircle size={19} /> : <CheckCircle2 size={19} />}<span>{notice.message}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}><X size={15} /></button></div>}
    </div>
  );
}

