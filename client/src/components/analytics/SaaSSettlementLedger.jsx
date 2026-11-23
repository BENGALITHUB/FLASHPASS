import React, { useCallback, useEffect, useState } from 'react';
import { DollarSign, Download, RefreshCw, ChevronDown, ChevronUp, Banknote, Ban, Inbox } from 'lucide-react';
import { api } from '../../services/api';
import {
  inr, fmtDate, todayIST, rupeesToPaise, METHOD_LABELS, REQUEST_LABELS,
  Field, SettlementModal, FormError
} from './settlementUi';

/**
 * Platform admin view: what each organizer is owed, what has been paid,
 * and what is still due. Payouts are recorded here after sending the money.
 */
export default function SaaSSettlementLedger() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [openEventId, setOpenEventId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [modal, setModal] = useState(null); // { kind: 'pay'|'void'|'reject', event?, payout?, request? }

  const load = useCallback(async () => {
    try {
      setLoadError('');
      setData(await api.settlementsList());
    } catch (err) {
      setLoadError(err.message || 'Could not load settlements');
    }
  }, []);

  const loadDetail = useCallback(async (eventId) => {
    try {
      setDetail(await api.settlementDetail(eventId));
    } catch (err) {
      setDetail({ error: err.message || 'Could not load history' });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (eventId) => {
    if (openEventId === eventId) {
      setOpenEventId(null);
      setDetail(null);
    } else {
      setOpenEventId(eventId);
      setDetail(null);
      loadDetail(eventId);
    }
  };

  const afterChange = async () => {
    setModal(null);
    await load();
    if (openEventId) await loadDetail(openEventId);
  };

  const download = async (eventId) => {
    try { await api.settlementDownloadStatement(eventId); } catch (err) { alert(err.message); }
  };

  const events = data?.events || [];
  const totals = data?.totals;

  return (
    <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000] space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-info/20 border border-info flex items-center justify-center">
            <DollarSign className="w-4 h-4 text-info" />
          </div>
          <div>
            <h3 className="font-comic text-xl text-text leading-tight tracking-wide">ORGANIZER SETTLEMENTS</h3>
            <p className="font-mono text-[11px] text-text-muted">
              Send the money from your bank/UPI, then record it here with the UTR
            </p>
          </div>
        </div>
        <button type="button" onClick={load} className="adm-btn adm-btn-ghost adm-btn-sm">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <FormError message={loadError} />

      {totals && (
        <dl className="grid grid-cols-2 lg:grid-cols-5 gap-3 font-mono">
          {[
            ['Organizers are owed', totals.owedPaise, 'text-text'],
            ['Already paid out', totals.paidOutPaise, 'text-success'],
            ['Balance due', totals.balancePaise, totals.balancePaise > 0 ? 'text-primary' : 'text-text'],
            ['Your platform fee', totals.platformPaise, 'text-info']
          ].map(([label, paise, cls]) => (
            <div key={label} className="rounded-2xl bg-surface-2 border border-border p-3">
              <dt className="text-[10px] uppercase tracking-wider text-text-muted">{label}</dt>
              <dd className={`mt-1 font-comic text-2xl ${cls}`}>₹{inr(paise)}</dd>
            </div>
          ))}
          <div className="rounded-2xl bg-surface-2 border border-border p-3">
            <dt className="text-[10px] uppercase tracking-wider text-text-muted">Payout requests</dt>
            <dd className={`mt-1 font-comic text-2xl ${totals.pendingRequests > 0 ? 'text-warning' : 'text-text'}`}>
              {totals.pendingRequests} waiting
            </dd>
          </div>
        </dl>
      )}

      {/* Per-event rows */}
      <div className="space-y-2.5">
        {data && events.length === 0 && (
          <p className="py-6 text-center font-mono text-xs text-text-muted">No events with sales yet.</p>
        )}
        {!data && !loadError && (
          <p className="py-6 text-center font-mono text-xs text-text-muted">Loading…</p>
        )}

        {events.map(ev => {
          const isOpen = openEventId === ev.eventId;
          const req = ev.pendingRequest;
          return (
            <div key={ev.eventId} className={`rounded-2xl border ${req ? 'border-warning/60' : 'border-border'} bg-surface-2/60`}>
              <div className="p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <strong className="block font-mono text-sm text-text truncate">{ev.name}</strong>
                  <span className="block font-mono text-[10px] text-text-muted">
                    {ev.organizer ? `Organizer: ${ev.organizer.name || ev.organizer.username}` : 'No organizer login'} • {ev.passesSold} passes • gross ₹{inr(ev.grossPaise)}
                  </span>
                </div>

                <dl className="flex flex-wrap gap-4 font-mono text-[11px]">
                  <div><dt className="text-text-muted">Owed</dt><dd className="font-bold text-text">₹{inr(ev.owedPaise)}</dd></div>
                  <div><dt className="text-text-muted">Paid</dt><dd className="font-bold text-success">₹{inr(ev.paidOutPaise)}</dd></div>
                  <div><dt className="text-text-muted">Balance</dt><dd className={`font-comic text-lg leading-none ${ev.balancePaise > 0 ? 'text-primary' : 'text-text'}`}>₹{inr(ev.balancePaise)}</dd></div>
                </dl>

                <div className="flex flex-wrap items-center gap-2">
                  {ev.balancePaise === 0 && ev.owedPaise > 0 && <span className="adm-chip adm-chip-success">Fully paid</span>}
                  {ev.balancePaise < 0 && <span className="adm-chip adm-chip-danger">Overpaid ₹{inr(-ev.balancePaise)}</span>}
                  <button
                    type="button"
                    onClick={() => setModal({ kind: 'pay', event: ev, request: req })}
                    disabled={ev.balancePaise <= 0}
                    className="adm-btn adm-btn-primary adm-btn-sm"
                  >
                    <Banknote className="h-3.5 w-3.5" /> Record payout
                  </button>
                  <button type="button" onClick={() => download(ev.eventId)} className="adm-btn adm-btn-ghost adm-btn-sm" title="Download statement CSV">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => toggle(ev.eventId)} aria-expanded={isOpen} className="adm-btn adm-btn-ghost adm-btn-sm">
                    History {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {req && (
                <div className="mx-3.5 mb-3.5 rounded-xl border border-warning/50 bg-warning/10 p-3 font-mono text-[11px] flex flex-wrap items-center justify-between gap-2">
                  <span className="text-warning">
                    <Inbox className="inline h-3.5 w-3.5 mr-1" />
                    {req.requestedBy?.name || 'Organizer'} asked for <strong>₹{inr(req.amountPaise)}</strong> on {fmtDate(req.createdAt)} • Pay to: <strong className="text-text">{req.payTo}</strong>
                    {req.note ? ` • "${req.note}"` : ''}
                  </span>
                  <button type="button" onClick={() => setModal({ kind: 'reject', request: req })} className="adm-btn adm-btn-ghost adm-btn-sm">
                    Reject
                  </button>
                </div>
              )}

              {isOpen && (
                <div className="border-t border-border/60 p-3.5">
                  {!detail && <p className="font-mono text-xs text-text-muted">Loading history…</p>}
                  {detail?.error && <FormError message={detail.error} />}
                  {detail?.payouts && (
                    <>
                      <h4 className="font-mono text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">Payouts</h4>
                      {detail.payouts.length === 0 && <p className="font-mono text-xs text-text-muted mb-3">Nothing paid yet.</p>}
                      <ul className="space-y-1.5 mb-4">
                        {detail.payouts.map(p => (
                          <li key={p._id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2 font-mono text-[11px] ${p.voided ? 'opacity-60' : ''}`}>
                            <span className={p.voided ? 'line-through' : ''}>
                              <strong className="text-text">₹{inr(p.amountPaise)}</strong> • {fmtDate(p.paidAt)} • {METHOD_LABELS[p.method] || p.method}
                              {p.reference && <> • Ref <strong className="text-text">{p.reference}</strong></>}
                              {' '}• by {p.recordedBy?.name}
                              {p.note && <> • {p.note}</>}
                            </span>
                            {p.voided ? (
                              <span className="text-danger">VOID: {p.voidReason}</span>
                            ) : (
                              <button type="button" onClick={() => setModal({ kind: 'void', payout: p })} className="adm-btn adm-btn-ghost adm-btn-sm">
                                <Ban className="h-3 w-3" /> Void
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                      <h4 className="font-mono text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2">Payout requests</h4>
                      {detail.requests.length === 0 && <p className="font-mono text-xs text-text-muted">No requests.</p>}
                      <ul className="space-y-1.5">
                        {detail.requests.map(r => (
                          <li key={r._id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2 font-mono text-[11px]">
                            <span>₹{inr(r.amountPaise)} • {fmtDate(r.createdAt)} • to {r.payTo}{r.resolutionNote ? ` • ${r.resolutionNote}` : ''}</span>
                            <span className={`adm-chip ${REQUEST_LABELS[r.status]?.cls || ''}`}>{REQUEST_LABELS[r.status]?.text || r.status}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {modal?.kind === 'pay' && <RecordPayoutModal event={modal.event} request={modal.request} methods={data?.methods} onClose={() => setModal(null)} onDone={afterChange} />}
      {modal?.kind === 'void' && <VoidPayoutModal payout={modal.payout} onClose={() => setModal(null)} onDone={afterChange} />}
      {modal?.kind === 'reject' && <RejectRequestModal request={modal.request} onClose={() => setModal(null)} onDone={afterChange} />}
    </div>
  );
}

/**
 * Overview banner for the platform admin when organizers are waiting to be paid.
 */
export function PendingPayoutBanner({ onOpen }) {
  const [pending, setPending] = useState([]);
  useEffect(() => {
    api.settlementsList()
      .then(d => setPending((d.events || []).filter(e => e.pendingRequest)))
      .catch(() => {});
  }, []);
  if (pending.length === 0) return null;
  const total = pending.reduce((sum, e) => sum + e.pendingRequest.amountPaise, 0);
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-warning/60 bg-warning/10 px-4 py-3 font-mono text-xs text-warning">
      <span className="flex items-center gap-2">
        <Inbox className="h-4 w-4 shrink-0" />
        {pending.length} organizer{pending.length === 1 ? ' is' : 's are'} waiting for a payout (₹{inr(total)}): {pending.map(e => e.name).join(', ')}
      </span>
      <button type="button" onClick={onOpen} className="adm-btn adm-btn-primary adm-btn-sm">Open settlements</button>
    </div>
  );
}

function RecordPayoutModal({ event, request, methods = Object.keys(METHOD_LABELS), onClose, onDone }) {
  const [linkRequest, setLinkRequest] = useState(Boolean(request));
  const defaultPaise = request ? Math.min(request.amountPaise, event.balancePaise) : event.balancePaise;
  const [form, setForm] = useState({
    amount: (defaultPaise / 100).toFixed(2),
    paidAt: todayIST(),
    method: 'UPI',
    reference: '',
    note: '',
    pin: ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const needsRef = ['BANK_TRANSFER', 'UPI', 'CHEQUE'].includes(form.method);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const amountPaise = rupeesToPaise(form.amount);
    if (!amountPaise) return setError('Enter the amount you sent');
    if (amountPaise > event.balancePaise) return setError(`That is more than the balance due (₹${inr(event.balancePaise)})`);
    if (needsRef && !form.reference.trim()) return setError('Enter the UTR / transaction / cheque number');
    if (!/^\d{6}$/.test(form.pin)) return setError('Enter your 6-digit admin PIN');
    setBusy(true);
    try {
      await api.settlementRecordPayout(event.eventId, {
        amountPaise,
        paidAt: form.paidAt,
        method: form.method,
        reference: form.reference.trim(),
        note: form.note.trim(),
        requestId: linkRequest && request ? request._id : null
      }, form.pin);
      await onDone();
    } catch (err) {
      setError(err.message || 'Could not record payout');
      setBusy(false);
    }
  };

  return (
    <SettlementModal title="Record payout" subtitle={`${event.name} • balance due ₹${inr(event.balancePaise)}`} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-4">
        <p className="rounded-xl bg-surface-2 border border-border px-3 py-2 font-mono text-[11px] text-text-muted">
          Send the money first from your bank or UPI app. This only records it.
        </p>
        {request && (
          <label className="flex items-start gap-2 rounded-xl border border-warning/50 bg-warning/10 px-3 py-2 font-mono text-[11px] text-warning">
            <input type="checkbox" checked={linkRequest} onChange={(e) => setLinkRequest(e.target.checked)} className="mt-0.5" />
            <span>This pays the organizer's request for ₹{inr(request.amountPaise)} • Pay to: <strong className="text-text">{request.payTo}</strong></span>
          </label>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Amount sent (₹)">
            <input className="adm-input w-full" inputMode="decimal" value={form.amount} onChange={set('amount')} autoFocus />
          </Field>
          <Field label="Date sent">
            <input className="adm-input w-full" type="date" max={todayIST()} value={form.paidAt} onChange={set('paidAt')} />
          </Field>
        </div>
        <Field label="Sent by">
          <select className="adm-input w-full cursor-pointer" value={form.method} onChange={set('method')}>
            {methods.map(m => <option key={m} value={m}>{METHOD_LABELS[m] || m}</option>)}
          </select>
        </Field>
        <Field label={needsRef ? 'UTR / transaction ID (required)' : 'Reference (optional)'} hint="From your bank or UPI app, so the payment can be traced">
          <input className="adm-input w-full" value={form.reference} onChange={set('reference')} maxLength={100} />
        </Field>
        <Field label="Note (optional)">
          <input className="adm-input w-full" value={form.note} onChange={set('note')} maxLength={500} placeholder="e.g. Day 1 & 2 settlement" />
        </Field>
        <Field label="Admin PIN">
          <input className="adm-input w-full" type="password" inputMode="numeric" maxLength={6} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} autoComplete="off" />
        </Field>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="adm-btn adm-btn-ghost">Cancel</button>
          <button type="submit" disabled={busy} className="adm-btn adm-btn-primary">{busy ? 'Saving…' : 'Record payout'}</button>
        </div>
      </form>
    </SettlementModal>
  );
}

function VoidPayoutModal({ payout, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (reason.trim().length < 5) return setError('Write why this payout is wrong');
    if (!/^\d{6}$/.test(pin)) return setError('Enter your 6-digit admin PIN');
    setBusy(true);
    try {
      await api.settlementVoidPayout(payout._id, reason.trim(), pin);
      await onDone();
    } catch (err) {
      setError(err.message || 'Could not void payout');
      setBusy(false);
    }
  };

  return (
    <SettlementModal title="Void payout" subtitle={`₹${inr(payout.amountPaise)} • ${fmtDate(payout.paidAt)}${payout.reference ? ` • Ref ${payout.reference}` : ''}`} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-4">
        <p className="font-mono text-[11px] text-text-muted">
          Use this only if the payout was recorded by mistake. It stays in the history marked void, and the amount goes back to the balance due.
        </p>
        <Field label="Reason">
          <input className="adm-input w-full" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus placeholder="e.g. Entered ₹6,000 instead of ₹600" />
        </Field>
        <Field label="Admin PIN">
          <input className="adm-input w-full" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="off" />
        </Field>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="adm-btn adm-btn-ghost">Cancel</button>
          <button type="submit" disabled={busy} className="adm-btn adm-btn-danger">{busy ? 'Voiding…' : 'Void payout'}</button>
        </div>
      </form>
    </SettlementModal>
  );
}

function RejectRequestModal({ request, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (reason.trim().length < 5) return setError('Tell the organizer why');
    setBusy(true);
    try {
      await api.settlementCloseRequest(request._id, reason.trim());
      await onDone();
    } catch (err) {
      setError(err.message || 'Could not reject request');
      setBusy(false);
    }
  };

  return (
    <SettlementModal title="Reject payout request" subtitle={`₹${inr(request.amountPaise)} to ${request.payTo}`} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Reason (the organizer will see this)">
          <input className="adm-input w-full" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus placeholder="e.g. IFSC code missing, please request again" />
        </Field>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="adm-btn adm-btn-ghost">Cancel</button>
          <button type="submit" disabled={busy} className="adm-btn adm-btn-danger">{busy ? 'Rejecting…' : 'Reject request'}</button>
        </div>
      </form>
    </SettlementModal>
  );
}
