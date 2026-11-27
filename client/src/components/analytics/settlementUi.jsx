import React, { useEffect } from 'react';
import { X } from 'lucide-react';

// Shared pieces for the organizer settlement screens.

export const inr = (paise) =>
  ((paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Fee rupees without trailing ".00": 100 -> "1", 250 -> "2.50"
const feeRs = (paise) => (paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2));

/**
 * How the platform fee adds up, using the rate each pass was actually sold at.
 * [{feePaise:100,passes:44},{feePaise:200,passes:4}] -> "44 × ₹1 + 4 × ₹2"
 * Falls back to the current rate when no passes are sold yet.
 */
export const feeEquation = (breakdown, currentFeePaise) => {
  if (!breakdown?.length) return `₹${feeRs(currentFeePaise ?? 200)} platform fee each`;
  return breakdown.map(b => `${b.passes} × ₹${feeRs(b.feePaise)}`).join(' + ');
};

export const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

// "1,234.50" or "1234.5" -> 123450 paise; null when not a valid positive amount
export const rupeesToPaise = (value) => {
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
};

export const METHOD_LABELS = {
  BANK_TRANSFER: 'Bank transfer (NEFT/IMPS/RTGS)',
  UPI: 'UPI',
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  OTHER: 'Other'
};

export const REQUEST_LABELS = {
  PENDING: { text: 'Waiting for payment', cls: 'adm-chip-cyan' },
  PAID: { text: 'Paid', cls: 'adm-chip-success' },
  REJECTED: { text: 'Rejected', cls: 'adm-chip-danger' },
  CANCELLED: { text: 'Cancelled', cls: '' }
};

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block font-mono text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">{label}</span>
      {children}
      {hint && <span className="block mt-1 font-mono text-[10px] text-text-muted">{hint}</span>}
    </label>
  );
}

export function SettlementModal({ title, subtitle, onClose, busy, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div className="responsive-dialog adm-modal-backdrop fixed inset-0 z-[70] flex items-start justify-center p-4 overflow-y-auto overscroll-contain">
      <div role="dialog" aria-modal="true" aria-label={title} className="adm-modal relative w-full max-w-lg my-8 rounded-3xl p-px">
        <div className="adm-modal-inner relative overflow-hidden rounded-[23px]">
          <div className="relative flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-white/[0.08]">
            <div className="min-w-0">
              <h3 className="font-comic text-2xl tracking-wide text-white leading-tight">{title}</h3>
              {subtitle && <p className="mt-1 font-mono text-[11px] text-text-muted">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="adm-btn adm-btn-ghost adm-btn-sm shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative px-5 sm:px-6 py-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger/50 bg-danger/10 px-3 py-2 font-mono text-xs text-danger">
      {message}
    </p>
  );
}
