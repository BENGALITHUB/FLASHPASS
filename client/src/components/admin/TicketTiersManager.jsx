import React, { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Star, Eye, EyeOff, Save, Ticket } from 'lucide-react';

const toRupees = (paise) => ((paise || 0) / 100).toString();
const toPaise = (rupees) => {
  const n = Number(String(rupees).trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

const blankTier = (pricePaise) => ({
  tierId: '',
  name: '',
  badge: '',
  price: toRupees(pricePaise),
  capacity: '0',
  perksText: '',
  featured: false,
  active: true,
  soldCount: 0,
  isNew: true
});

const fromServer = (t) => ({
  tierId: t.tierId,
  name: t.name || '',
  badge: t.badge || '',
  price: toRupees(t.pricePaise),
  capacity: String(t.capacity ?? 0),
  perksText: (t.perks || []).join('\n'),
  featured: Boolean(t.featured),
  active: t.active !== false,
  soldCount: t.soldCount || 0,
  isNew: false
});

/**
 * Admin control over the ticket types sold on checkout.
 * Nothing set up = one General pass at the event price.
 */
export default function TicketTiersManager({ tiers = [], defaultPricePaise = 5000, feePaise = 200, onSave }) {
  const [draft, setDraft] = useState(() => tiers.map(fromServer));
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null); // { ok, text }
  // True while the admin has unsaved edits. The dashboard reloads data every few
  // seconds; those reloads must never wipe what the admin is typing.
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const markDirty = (value) => { dirtyRef.current = value; setDirty(value); };

  const serverKey = JSON.stringify(tiers);
  useEffect(() => {
    if (!dirtyRef.current) setDraft(tiers.map(fromServer));
    // serverKey: only react when the saved tiers actually change, not on every reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  const edit = (fn) => { markDirty(true); setDraft(fn); };
  const update = (idx, patch) => edit(d => d.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  const remove = (idx) => edit(d => d.filter((_, i) => i !== idx));
  const setFeatured = (idx) => edit(d => d.map((t, i) => ({ ...t, featured: i === idx ? !t.featured : false })));
  const discard = () => { markDirty(false); setDraft(tiers.map(fromServer)); setMessage(null); };

  const save = async () => {
    setMessage(null);
    const out = [];
    for (const t of draft) {
      const name = t.name.trim();
      if (name.length < 2) return setMessage({ ok: false, text: 'Every ticket type needs a name.' });
      const pricePaise = toPaise(t.price);
      if (pricePaise === null) return setMessage({ ok: false, text: `"${name}": enter a valid price.` });
      const capacity = Number(t.capacity || 0);
      if (!Number.isInteger(capacity) || capacity < 0) return setMessage({ ok: false, text: `"${name}": capacity must be a whole number (0 = no separate limit).` });
      out.push({
        tierId: t.isNew ? undefined : t.tierId,
        name,
        badge: t.badge.trim(),
        pricePaise,
        capacity,
        perks: t.perksText.split('\n').map(s => s.trim()).filter(Boolean),
        featured: t.featured,
        active: t.active
      });
    }
    if (!/^\d{6}$/.test(pin)) return setMessage({ ok: false, text: 'Enter your 6-digit login PIN to save.' });

    setBusy(true);
    // Not dirty any more, so the reload inside onSave brings back the saved
    // tiers with their new ids (a second save then won't duplicate them)
    markDirty(false);
    try {
      await onSave(out, pin);
      setPin('');
      setMessage({ ok: true, text: 'Saved. Checkout shows these ticket types now.' });
    } catch (err) {
      markDirty(true);
      setMessage({ ok: false, text: err.message || 'Could not save ticket types' });
    } finally {
      setBusy(false);
    }
  };

  const activeCount = draft.filter(t => t.active).length;

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-3xl bg-surface border-2 border-border shadow-[3px_3px_0_#000] font-mono text-xs text-text-muted leading-relaxed">
        {draft.length === 0 || activeCount === 0 ? (
          <>No ticket types are on sale, so checkout sells one <strong className="text-text">General Pass at ₹{toRupees(defaultPricePaise)}</strong> (the price in Core settings). Add ticket types below to sell more than one kind.</>
        ) : (
          <>Checkout shows the <strong className="text-text">{activeCount}</strong> ticket type{activeCount === 1 ? '' : 's'} switched on below. A ₹{toRupees(feePaise)} platform fee is added to each pass.</>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {draft.map((tier, idx) => (
          <div
            key={tier.tierId || `new-${idx}`}
            className={`p-4 rounded-3xl bg-surface border-2 shadow-[3px_3px_0_#000] space-y-3 ${tier.active ? 'border-border' : 'border-dashed border-border opacity-70'}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-text-muted">
                {tier.isNew ? 'New ticket type' : `${tier.soldCount} sold`}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFeatured(idx)}
                  aria-pressed={tier.featured}
                  title="Show a POPULAR label on checkout"
                  className={`adm-btn adm-btn-sm ${tier.featured ? 'adm-btn-primary' : 'adm-btn-ghost'}`}
                >
                  <Star className="h-3.5 w-3.5" /> {tier.featured ? 'Popular' : 'Mark popular'}
                </button>
                <button
                  type="button"
                  onClick={() => update(idx, { active: !tier.active })}
                  aria-pressed={tier.active}
                  title={tier.active ? 'On sale. Click to stop selling' : 'Not on sale. Click to sell'}
                  className={`adm-btn adm-btn-sm ${tier.active ? 'adm-btn-cyan' : 'adm-btn-ghost'}`}
                >
                  {tier.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {tier.active ? 'On sale' : 'Off'}
                </button>
              </div>
            </div>

            <label className="block">
              <span className="text-[10px] font-mono text-text-muted block mb-1">Name shown to buyers</span>
              <input className="adm-input" value={tier.name} maxLength={60} onChange={(e) => update(idx, { name: e.target.value })} placeholder="e.g. General Pass" />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[10px] font-mono text-text-muted block mb-1">Price (₹, before fee)</span>
                <input className="adm-input" inputMode="decimal" value={tier.price} onChange={(e) => update(idx, { price: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-[10px] font-mono text-text-muted block mb-1">Max passes (0 = no limit)</span>
                <input className="adm-input" inputMode="numeric" value={tier.capacity} onChange={(e) => update(idx, { capacity: e.target.value.replace(/\D/g, '') })} />
              </label>
            </div>

            <label className="block">
              <span className="text-[10px] font-mono text-text-muted block mb-1">Badge on the pass</span>
              <input className="adm-input uppercase" value={tier.badge} maxLength={24} onChange={(e) => update(idx, { badge: e.target.value })} placeholder="e.g. GENERAL" />
            </label>

            <label className="block">
              <span className="text-[10px] font-mono text-text-muted block mb-1">What's included (one per line)</span>
              <textarea
                rows={3}
                className="adm-input py-2 leading-snug resize-none"
                value={tier.perksText}
                onChange={(e) => update(idx, { perksText: e.target.value })}
                placeholder={'Entry all 3 days\nFree comic'}
              />
            </label>

            {tier.soldCount > 0 ? (
              <p className="font-mono text-[10px] text-text-muted">Has sales, so it can't be deleted. Switch it off to stop selling.</p>
            ) : (
              <button type="button" onClick={() => remove(idx)} className="adm-btn adm-btn-ghost adm-btn-sm text-danger">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={() => edit(d => [...d, blankTier(defaultPricePaise)])}
          className="min-h-[180px] rounded-3xl border-2 border-dashed border-border hover:border-primary text-text-muted hover:text-primary flex flex-col items-center justify-center gap-2 font-mono text-xs"
        >
          {draft.length === 0 ? <Ticket className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
          Add ticket type
        </button>
      </div>

      <div className="p-4 rounded-3xl bg-surface border-2 border-border shadow-[3px_3px_0_#000] flex flex-wrap items-center justify-between gap-4">
        <label className="flex items-center gap-3">
          <span className="text-xs font-mono text-text-muted">Your 6-digit login PIN</span>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            className="adm-input w-32 text-center tracking-widest"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && (
            <>
              <span className="font-mono text-[11px] text-warning">Unsaved changes</span>
              <button type="button" onClick={discard} disabled={busy} className="adm-btn adm-btn-ghost">Discard</button>
            </>
          )}
          <button type="button" onClick={save} disabled={busy} className="adm-btn adm-btn-primary">
            <Save className="h-4 w-4" /> {busy ? 'Saving…' : 'Save ticket types'}
          </button>
        </div>
        {message && (
          <p role={message.ok ? 'status' : 'alert'} className={`w-full font-mono text-xs ${message.ok ? 'text-success' : 'text-danger'}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
