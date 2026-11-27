import React, { useCallback, useEffect, useState } from 'react';
import { Landmark, CheckCircle2, Download, ChevronRight, Ticket, CalendarClock, Wallet, Clock, FileText, Zap } from 'lucide-react';
import { api } from '../../services/api';
import { inr, fmtDate, rupeesToPaise, feeEquation, METHOD_LABELS, REQUEST_LABELS, Field, SettlementModal, FormError } from './settlementUi';

/**
 * Organizer view: what they've earned, what the platform has paid them,
 * what is still due, and a real payout request.
 */
export default function OrganizerPayoutCard({ metrics, eventName, onExportLedger }) {
  const [detail, setDetail] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [showRequest, setShowRequest] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoadError('');
      const list = await api.settlementsList();
      const own = list.events?.[0];
      setDetail(own ? await api.settlementDetail(own.eventId) : { summary: null, payouts: [], requests: [] });
    } catch (err) {
      setLoadError(err.message || 'Could not load your settlement');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = detail?.summary;
  const pending = s?.pendingRequest;
  const payouts = (detail?.payouts || []).filter(p => !p.voided);
  const lastClosed = (detail?.requests || []).find(r => r.status === 'REJECTED' || r.status === 'PAID');

  // Sales channel split comes from the live dashboard metrics
  const toNum = (v) => Number.parseFloat(v) || 0;
  const onlineGross = toNum(metrics?.ledger?.onlineGrossRupees);
  const cashGross = toNum(metrics?.ledger?.cashGrossRupees);
  const channelTotal = onlineGross + cashGross;
  const onlinePct = channelTotal ? Math.round((onlineGross / channelTotal) * 100) : 0;
  const cashPct = channelTotal ? 100 - onlinePct : 0;
  const currentFeePaise = metrics?.pricing?.platformFeePaise ?? 200;
  const soldFees = s?.feeBreakdown || [];
  // Show the current rate too when it differs from what the sold passes paid
  const rateChanged = soldFees.length > 0 && soldFees.some(b => b.feePaise !== currentFeePaise);

  const cancelRequest = async () => {
    if (!pending) return;
    setCancelling(true);
    try {
      await api.settlementCloseRequest(pending._id);
      await load();
    } catch (err) {
      alert(err.message || 'Could not cancel request');
    } finally {
      setCancelling(false);
    }
  };

  const downloadStatement = async () => {
    try { await api.settlementDownloadStatement(s.eventId); } catch (err) { alert(err.message); }
  };

  return (
    <section className="adm-hero relative overflow-hidden rounded-3xl p-5 sm:p-6" aria-labelledby="payout-title">
      <div className="adm-hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />

      {/* Header */}
      <div className="relative flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-white/[0.08]">
        <div className="flex min-w-0 items-center gap-4">
          <div className="adm-icon-tile adm-icon-tile-yellow h-12 w-12 sm:h-14 sm:w-14 shrink-0 rounded-2xl">
            <Landmark className="h-6 w-6 sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0">
            <span className="font-mono text-[10px] text-text-muted">Your earnings and payouts</span>
            <h3 id="payout-title" className="font-comic text-2xl sm:text-3xl text-white tracking-wide leading-tight">
              Settlement <span className="text-text-muted">•</span> <span className="text-primary">{s?.name || eventName || 'Your event'}</span>
            </h3>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {s && (
            <button type="button" onClick={downloadStatement} className="adm-btn adm-btn-ghost">
              <FileText className="h-4 w-4 text-info" /> <span>Statement</span>
            </button>
          )}
          {onExportLedger && (
            <button type="button" onClick={onExportLedger} className="adm-btn adm-btn-ghost">
              <Download className="h-4 w-4 text-info" /> <span>Sales CSV</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowRequest(true)}
            disabled={!s || s.balancePaise <= 0 || Boolean(pending)}
            className="adm-btn adm-btn-primary group"
          >
            <Zap className="h-4 w-4 fill-black" />
            <span>{pending ? 'Request sent' : 'Request payout'}</span>
            {!pending && <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
          </button>
        </div>
      </div>

      <div className="relative">
        <FormError message={loadError} />
      </div>

      {/* Open request status */}
      {pending && (
        <div role="status" className="relative mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-info/40 bg-info/10 px-3.5 py-2.5 font-mono text-xs text-info">
          <span className="flex items-center gap-2">
            <Clock className="h-4 w-4 shrink-0" />
            You asked for ₹{inr(pending.amountPaise)} on {fmtDate(pending.createdAt)} to {pending.payTo}. Waiting for the platform to pay.
          </span>
          <button type="button" onClick={cancelRequest} disabled={cancelling} className="adm-btn adm-btn-ghost adm-btn-sm">
            {cancelling ? 'Cancelling…' : 'Cancel request'}
          </button>
        </div>
      )}
      {!pending && lastClosed?.status === 'REJECTED' && (
        <div role="status" className="relative mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 font-mono text-xs text-danger">
          Your request for ₹{inr(lastClosed.amountPaise)} was not paid: {lastClosed.resolutionNote || 'no reason given'}. You can request again.
        </div>
      )}

      <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-5 pt-5">
        {/* Balance + how it's calculated */}
        <div className="lg:col-span-7 adm-inset rounded-2xl p-5">
          <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-text-muted">
            <Wallet className="h-3.5 w-3.5 text-primary" /> Balance due to you
          </span>
          <div className="mt-2 font-comic text-5xl sm:text-6xl leading-none text-primary adm-number-glow">₹{inr(s?.balancePaise)}</div>

          <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="adm-flow rounded-xl px-2 py-2.5">
              <dt className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Your share</dt>
              <dd className="mt-1 font-comic text-lg sm:text-xl whitespace-nowrap text-white">₹{inr(s?.owedPaise)}</dd>
            </div>
            <div className="adm-flow rounded-xl px-2 py-2.5">
              <dt className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Paid to you</dt>
              <dd className="mt-1 font-comic text-lg sm:text-xl whitespace-nowrap text-success">−₹{inr(s?.paidOutPaise)}</dd>
            </div>
            <div className="adm-flow adm-flow-total rounded-xl px-2 py-2.5">
              <dt className="font-mono text-[9px] uppercase tracking-wider text-text-muted">Still due</dt>
              <dd className="mt-1 font-comic text-lg sm:text-xl whitespace-nowrap text-primary">₹{inr(s?.balancePaise)}</dd>
            </div>
          </dl>
          <p className="mt-2 font-mono text-[10px] text-text-muted">
            Your share = gross ₹{inr(s?.grossPaise)} − platform fee ₹{inr(s?.platformPaise)}{soldFees.length ? ` (${feeEquation(soldFees)})` : ''}, after any refunds.
          </p>

          {/* Channel split */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-text-muted">
              <span>Sales channel split</span>
              <span>{s?.passesSold ?? 0} passes</span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`Online ${onlinePct}%, cash ${cashPct}%`}>
              <div className="bg-info transition-[width] duration-500" style={{ width: `${onlinePct}%` }} />
              <div className="bg-exit transition-[width] duration-500" style={{ width: `${cashPct}%` }} />
            </div>
            <div className="mt-2.5 flex flex-wrap justify-between gap-2 font-mono text-[11px]">
              <span className="flex items-center gap-1.5 text-text-muted">
                <span className="h-2 w-2 rounded-full bg-info" /> Online <strong className="text-white">₹{onlineGross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong> ({onlinePct}%)
              </span>
              <span className="flex items-center gap-1.5 text-text-muted">
                <span className="h-2 w-2 rounded-full bg-exit" /> Box office cash <strong className="text-white">₹{cashGross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong> ({cashPct}%)
              </span>
            </div>
          </div>
        </div>

        {/* Facts + payout history */}
        <div className="lg:col-span-5 space-y-3">
          <dl className="grid grid-cols-2 gap-3">
            <div className="adm-fact rounded-2xl p-4">
              <dt className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted"><Ticket className="h-3.5 w-3.5 text-info" /> Passes sold</dt>
              <dd className="mt-2 font-comic text-3xl text-white leading-none">{s?.passesSold ?? 0}</dd>
              <dd className="mt-1.5 font-mono text-[10px] text-text-muted">
                {soldFees.length ? `Fee: ${feeEquation(soldFees)}` : feeEquation(soldFees, currentFeePaise)}
              </dd>
              {rateChanged && (
                <dd className="mt-0.5 font-mono text-[10px] text-text-muted">New sales: ₹{inr(currentFeePaise)} fee each</dd>
              )}
            </div>
            <div className="adm-fact rounded-2xl p-4">
              <dt className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted"><CalendarClock className="h-3.5 w-3.5 text-success" /> Last payout</dt>
              <dd className="mt-2 font-comic text-2xl text-white leading-none">{s?.lastPaidAt ? fmtDate(s.lastPaidAt) : 'None yet'}</dd>
              <dd className="mt-1.5 font-mono text-[10px] text-text-muted">{payouts.length} payout{payouts.length === 1 ? '' : 's'} received</dd>
            </div>
          </dl>

          <div className="adm-fact rounded-2xl p-4">
            <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">Payments received</h4>
            {payouts.length === 0 ? (
              <p className="font-mono text-[11px] text-text-muted">No payments yet.</p>
            ) : (
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {payouts.map(p => (
                  <li key={p._id} className="flex items-start justify-between gap-2 font-mono text-[11px]">
                    <span className="text-text-muted">
                      <CheckCircle2 className="inline h-3 w-3 text-success mr-1" />
                      {fmtDate(p.paidAt)} • {METHOD_LABELS[p.method] || p.method}{p.reference ? ` • ${p.reference}` : ''}
                    </span>
                    <strong className="text-white shrink-0">₹{inr(p.amountPaise)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {showRequest && s && (
        <RequestPayoutModal summary={s} onClose={() => setShowRequest(false)} onDone={async () => { setShowRequest(false); await load(); }} />
      )}
    </section>
  );
}

function RequestPayoutModal({ summary, onClose, onDone }) {
  const [amount, setAmount] = useState((summary.balancePaise / 100).toFixed(2));
  const [payTo, setPayTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const amountPaise = rupeesToPaise(amount);
    if (!amountPaise || amountPaise > summary.balancePaise) return setError(`Enter an amount up to ₹${inr(summary.balancePaise)}`);
    if (payTo.trim().length < 5) return setError('Enter your UPI ID or bank account details');
    setBusy(true);
    try {
      await api.settlementRequestPayout(summary.eventId, { amountPaise, payTo: payTo.trim(), note: note.trim() });
      await onDone();
    } catch (err) {
      setError(err.message || 'Could not send request');
      setBusy(false);
    }
  };

  return (
    <SettlementModal title="Request payout" subtitle={`Balance due ₹${inr(summary.balancePaise)}`} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Amount (₹)">
          <input className="adm-input w-full" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </Field>
        <Field label="Pay to" hint="UPI ID, or account holder name + account number + IFSC">
          <textarea className="adm-input w-full py-2.5 leading-snug" rows={2} value={payTo} onChange={(e) => setPayTo(e.target.value)} maxLength={300} placeholder="e.g. organizer@okhdfc" />
        </Field>
        <Field label="Note (optional)">
          <input className="adm-input w-full" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="adm-btn adm-btn-ghost">Cancel</button>
          <button type="submit" disabled={busy} className="adm-btn adm-btn-primary">{busy ? 'Sending…' : 'Send request'}</button>
        </div>
      </form>
    </SettlementModal>
  );
}
