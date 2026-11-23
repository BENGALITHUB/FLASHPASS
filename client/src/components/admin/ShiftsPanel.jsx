import React, { useEffect, useState } from 'react';
import { Wallet, Download, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';

const inr = (p) => `₹${((p || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * Box office cash reconciliation: every cashier shift with expected vs counted cash.
 */
export default function ShiftsPanel({ onExport }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.adminListShifts().then(d => { setData(d); setError(''); }).catch(e => setError(e.message || 'Could not load shifts'));
  useEffect(() => { load(); }, []);

  const shifts = data?.shifts || [];
  const t = data?.totals;

  return (
    <section className="adm-panel rounded-3xl p-5 space-y-4" aria-labelledby="shifts-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="shifts-title" className="flex items-center gap-2 font-comic text-xl tracking-wide text-white">
            <Wallet className="h-4 w-4 text-primary" /> Cashier shifts
          </h3>
          <p className="font-mono text-[11px] text-text-muted">Cash that should be in each drawer vs what the cashier counted at close</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="adm-btn adm-btn-ghost adm-btn-sm"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
          <button type="button" onClick={() => onExport('shifts')} className="adm-btn adm-btn-ghost adm-btn-sm"><Download className="h-3.5 w-3.5" /> Shifts CSV</button>
        </div>
      </div>

      {error && <p role="alert" className="font-mono text-xs text-danger">{error}</p>}

      {t && (
        <div className="flex flex-wrap gap-2 font-mono text-[11px]">
          <span className="adm-chip adm-chip-cyan">{t.openShifts} open</span>
          <span className="adm-chip">{t.closedShifts} closed</span>
          <span className={`adm-chip ${t.shortShifts > 0 ? 'adm-chip-danger' : 'adm-chip-success'}`}>{t.shortShifts} short</span>
          <span className={`adm-chip ${t.netDifferencePaise < 0 ? 'adm-chip-danger' : 'adm-chip-success'}`}>Net difference {inr(t.netDifferencePaise)}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="border-b border-border text-text-muted">
              {['Cashier', 'Shift', 'Tickets', 'Cash at start', 'Cash sales', 'Should be', 'Counted', 'Difference', 'Note'].map(h => (
                <th key={h} className="py-2 px-2 font-bold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data && shifts.length === 0 && (
              <tr><td colSpan={9} className="py-6 text-center text-text-muted">No shifts yet. A shift starts when a cashier opens the box office screen.</td></tr>
            )}
            {shifts.map(s => {
              const open = s.status === 'OPEN';
              return (
                <tr key={s._id} className="border-b border-border/50">
                  <td className="py-2.5 px-2 text-white font-bold whitespace-nowrap">{s.cashierName || 'Cashier'}</td>
                  <td className="py-2.5 px-2 whitespace-nowrap text-text-muted">
                    {when(s.openedAt)} → {open ? <span className="adm-chip adm-chip-cyan">Open</span> : when(s.closedAt)}
                  </td>
                  <td className="py-2.5 px-2">{s.ticketCount || 0}</td>
                  <td className="py-2.5 px-2 whitespace-nowrap">{inr(s.openingFloatPaise)}</td>
                  <td className="py-2.5 px-2 whitespace-nowrap">{inr(s.salesPaise)}</td>
                  <td className="py-2.5 px-2 whitespace-nowrap text-primary">{inr(s.expectedPaise)}</td>
                  <td className="py-2.5 px-2 whitespace-nowrap">{open ? '—' : inr(s.countedPaise)}</td>
                  <td className={`py-2.5 px-2 whitespace-nowrap font-bold ${open ? 'text-text-muted' : s.differencePaise < 0 ? 'text-danger' : s.differencePaise > 0 ? 'text-warning' : 'text-success'}`}>
                    {open ? '—' : s.differencePaise === 0 ? 'Matches' : `${s.differencePaise > 0 ? '+' : '−'}${inr(Math.abs(s.differencePaise))}`}
                  </td>
                  <td className="py-2.5 px-2 text-text-muted max-w-[220px] truncate" title={s.notes || ''}>{s.notes || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
