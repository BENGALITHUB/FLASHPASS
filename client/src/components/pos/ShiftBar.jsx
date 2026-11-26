import React, { useEffect, useState } from 'react';
import { Clock3, Lock, Pencil, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../../services/api';
import { toPaise, formatMoney } from '../../utils/pos';

const time = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

const input = {
  width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(7,7,16,.55)', color: '#f5f5fa', fontSize: 16, fontVariantNumeric: 'tabular-nums'
};
const label = { display: 'block', fontSize: 11, color: 'var(--pos-muted)', marginBottom: 6, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' };

/**
 * Shift strip on the box office screen: when the shift started, the cash that was
 * in the drawer at the start, what should be in the drawer now, and Close shift
 * (count the drawer, see the difference, note why if it doesn't match).
 */
export default function ShiftBar({ shift, disabled, onChanged }) {
  const [editingFloat, setEditingFloat] = useState(false);
  const [floatInput, setFloatInput] = useState('');
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!shift) return null;

  const saveFloat = async (e) => {
    e.preventDefault();
    const paise = toPaise(floatInput.trim() || '0');
    if (paise === null) { setError('Enter the cash in the drawer, e.g. 500 or 500.50'); return; }
    setBusy(true); setError('');
    try {
      await api.posSetShiftFloat(paise);
      setEditingFloat(false);
      await onChanged();
    } catch (err) { setError(err.message || 'Could not save'); }
    finally { setBusy(false); }
  };

  return (
    <section aria-label="Your shift" className="pos-shiftbar">
      <span className="pos-shiftbar-item">
        <Clock3 size={15} /> Shift started <strong>{time(shift.openedAt)}</strong>
      </span>

      {editingFloat ? (
        <form onSubmit={saveFloat} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <label htmlFor="pos-float" style={{ fontSize: 12, color: 'var(--pos-muted)' }}>Cash in drawer at start ₹</label>
          <input id="pos-float" autoFocus inputMode="decimal" value={floatInput} onChange={e => setFloatInput(e.target.value)} style={{ ...input, width: 110, minHeight: 36 }} />
          <button type="submit" className="pos-button pos-button-primary" disabled={busy} style={{ padding: '8px 12px' }}>Save</button>
          <button type="button" className="pos-button pos-button-secondary" disabled={busy} onClick={() => { setEditingFloat(false); setError(''); }} style={{ padding: '8px 10px' }} aria-label="Cancel"><X size={14} /></button>
        </form>
      ) : (
        <span className="pos-shiftbar-item">
          Cash at start <strong>{formatMoney(shift.openingFloatPaise)}</strong>
          <button type="button" className="pos-shiftbar-edit" disabled={disabled} onClick={() => { setFloatInput(String((shift.openingFloatPaise || 0) / 100)); setEditingFloat(true); }}>
            <Pencil size={11} /> {shift.openingFloatPaise ? 'Edit' : 'Set'}
          </button>
        </span>
      )}

      <span className="pos-shiftbar-item">
        Should be in drawer now <strong className="pos-shiftbar-expected">{formatMoney(shift.expectedInDrawerPaise)}</strong>
      </span>

      <button type="button" className="pos-button pos-button-secondary" disabled={disabled} onClick={() => setClosing(true)}>
        <Lock size={15} /> Close shift
      </button>

      {error && <p role="alert" style={{ width: '100%', margin: 0, fontSize: 12, color: '#efb08c' }}>{error}</p>}

      {closing && <CloseShiftDialog shift={shift} onClose={() => setClosing(false)} onDone={onChanged} />}
    </section>
  );
}

function CloseShiftDialog({ shift, onClose, onDone }) {
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) (result ? finish() : onClose()); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const countedPaise = counted.trim() === '' ? null : toPaise(counted.trim());
  const diff = countedPaise === null ? null : countedPaise - shift.expectedInDrawerPaise;

  const submit = async (e) => {
    e.preventDefault();
    if (countedPaise === null) { setError('Count the cash in the drawer and enter the total.'); return; }
    if (diff !== 0 && notes.trim().length < 5) { setError('The drawer does not match. Write a short note on why.'); return; }
    setBusy(true); setError('');
    try {
      setResult(await api.posCloseShift(countedPaise, notes.trim()));
    } catch (err) { setError(err.message || 'Could not close the shift'); }
    finally { setBusy(false); }
  };

  const finish = async () => { onClose(); await onDone(); };

  return (
    <div role="dialog" aria-modal="true" aria-label="Close shift" className="pos-shift-modal">
      <div>
        {result ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              {result.shift.differencePaise === 0 ? <CheckCircle2 color="#00f5a0" /> : <AlertCircle color="#efb08c" />}
              <h2 style={{ margin: 0, fontSize: 20 }}>Shift closed</h2>
            </div>
            <p style={{ fontSize: 13, color: 'var(--pos-muted)', marginTop: 0 }}>{result.message}</p>
            <Summary rows={[
              ['Tickets sold', result.shift.ticketCount],
              ['Cash sales', formatMoney(result.shift.salesPaise)],
              ['Should be in drawer', formatMoney(result.shift.expectedPaise)],
              ['Counted', formatMoney(result.shift.countedPaise)],
              ['Difference', formatMoney(result.shift.differencePaise)]
            ]} />
            <button type="button" className="pos-button pos-button-primary" onClick={finish} style={{ width: '100%', marginTop: 16 }}>
              Done. Next sale starts a new shift
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <h2 style={{ margin: '0 0 4px', fontSize: 20 }}>Close shift</h2>
            <p style={{ fontSize: 12, color: 'var(--pos-muted)', marginTop: 0 }}>Count all the cash in your drawer, then enter the total.</p>
            <Summary rows={[
              ['Started', time(shift.openedAt)],
              ['Tickets sold', shift.ticketCount],
              ['Cash at start', formatMoney(shift.openingFloatPaise)],
              ['Cash sales', formatMoney(shift.salesPaise)],
              ['Should be in drawer', formatMoney(shift.expectedInDrawerPaise)]
            ]} />
            <div style={{ marginTop: 16 }}>
              <label htmlFor="pos-counted" style={label}>Cash counted in drawer (₹)</label>
              <input id="pos-counted" autoFocus inputMode="decimal" value={counted} onChange={e => { setCounted(e.target.value); setError(''); }} style={input} />
            </div>
            {diff !== null && (
              <p role="status" style={{ margin: '10px 0 0', fontSize: 13, fontWeight: 600, color: diff === 0 ? '#00f5a0' : '#efb08c' }}>
                {diff === 0 ? 'Matches exactly.' : `${diff > 0 ? 'Over' : 'Short'} by ${formatMoney(Math.abs(diff))}`}
              </p>
            )}
            <div style={{ marginTop: 14 }}>
              <label htmlFor="pos-notes" style={label}>Note {diff !== null && diff !== 0 ? '(required: why it does not match)' : '(optional)'}</label>
              <textarea id="pos-notes" rows={2} value={notes} maxLength={500} onChange={e => setNotes(e.target.value)} style={{ ...input, padding: 10, minHeight: 64, resize: 'none' }} />
            </div>
            {error && <p role="alert" style={{ fontSize: 12, color: '#efb08c', margin: '10px 0 0' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button type="button" className="pos-button pos-button-secondary" onClick={onClose} disabled={busy} style={{ flex: 1 }}>Cancel</button>
              <button type="submit" className="pos-button pos-button-primary" disabled={busy} style={{ flex: 1 }}>{busy ? 'Closing…' : 'Close shift'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Summary({ rows }) {
  return (
    <dl style={{ margin: 0, borderTop: '1px solid var(--pos-line)' }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--pos-line)', fontSize: 13 }}>
          <dt style={{ color: 'var(--pos-muted)' }}>{k}</dt>
          <dd style={{ margin: 0, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
