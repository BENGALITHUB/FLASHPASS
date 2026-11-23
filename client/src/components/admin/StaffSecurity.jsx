import React, { useEffect, useState } from 'react';
import { KeyRound, Power, ShieldAlert } from 'lucide-react';
import { api } from '../../services/api';
import { Field, SettlementModal, FormError } from '../analytics/settlementUi';

/**
 * Warning shown while demo accounts still use the PINs published in the README.
 */
export function DemoPinBanner({ onFix, refreshKey }) {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    api.adminDemoPinAccounts().then(d => setAccounts(d.accounts || [])).catch(() => {});
  }, [refreshKey]);
  if (accounts.length === 0) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-danger/60 bg-danger/10 px-4 py-3 font-mono text-xs text-danger">
      <span className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        {accounts.map(a => `@${a.username}`).join(', ')} still {accounts.length === 1 ? 'uses its' : 'use their'} demo PIN. Anyone who has seen the README can log in. Change {accounts.length === 1 ? 'it' : 'them'} before the event.
      </span>
      {onFix && <button type="button" onClick={onFix} className="adm-btn adm-btn-danger adm-btn-sm">Change PINs</button>}
    </div>
  );
}

/**
 * Change PIN / switch off buttons on a staff card.
 */
export function StaffActions({ user, currentUserId, onChanged }) {
  const [modal, setModal] = useState(null); // 'pin' | 'active'
  const self = String(user._id) === String(currentUserId);
  const active = user.active !== false;
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setModal('pin')} className="adm-btn adm-btn-ghost adm-btn-sm">
          <KeyRound className="h-3.5 w-3.5" /> {self ? 'Change my PIN' : 'Change PIN'}
        </button>
        {!self && (
          <button type="button" onClick={() => setModal('active')} className={`adm-btn adm-btn-sm ${active ? 'adm-btn-ghost' : 'adm-btn-cyan'}`}>
            <Power className="h-3.5 w-3.5" /> {active ? 'Switch off' : 'Switch on'}
          </button>
        )}
      </div>
      {modal === 'pin' && <PinModal user={user} self={self} onClose={() => setModal(null)} onDone={async () => { setModal(null); await onChanged(); }} />}
      {modal === 'active' && <ActiveModal user={user} active={active} onClose={() => setModal(null)} onDone={async () => { setModal(null); await onChanged(); }} />}
    </>
  );
}

function PinModal({ user, self, onClose, onDone }) {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [mine, setMine] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const digits = (v) => v.replace(/\D/g, '').slice(0, 6);

  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(pin)) return setError('The new PIN must be 6 digits.');
    if (pin !== again) return setError('The two new PINs do not match.');
    if (!/^\d{6}$/.test(mine)) return setError(self ? 'Enter your current PIN.' : 'Enter your own login PIN to confirm.');
    setBusy(true); setError('');
    try {
      await api.adminResetStaffPin(user._id, pin, mine);
      await onDone();
    } catch (err) { setError(err.message || 'Could not change the PIN'); setBusy(false); }
  };

  const pinInput = (value, set, id) => (
    <input id={id} className="adm-input w-full tracking-[0.4em]" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={value} onChange={e => set(digits(e.target.value))} />
  );

  return (
    <SettlementModal title={self ? 'Change my PIN' : `Change PIN for @${user.username}`} subtitle={self ? 'You will use the new PIN next time you log in.' : 'Tell them the new PIN in person, not over chat.'} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="New 6-digit PIN" hint="Not 111111, 123456 or other easy ones.">{pinInput(pin, setPin, 'new-pin')}</Field>
        <Field label="New PIN again">{pinInput(again, setAgain, 'new-pin-again')}</Field>
        <Field label={self ? 'Your current PIN' : 'Your own login PIN (to confirm)'}>{pinInput(mine, setMine, 'my-pin')}</Field>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="adm-btn adm-btn-ghost">Cancel</button>
          <button type="submit" disabled={busy} className="adm-btn adm-btn-primary">{busy ? 'Saving…' : 'Change PIN'}</button>
        </div>
      </form>
    </SettlementModal>
  );
}

function ActiveModal({ user, active, onClose, onDone }) {
  const [mine, setMine] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(mine)) return setError('Enter your own login PIN to confirm.');
    setBusy(true); setError('');
    try {
      await api.adminSetStaffActive(user._id, !active, mine);
      await onDone();
    } catch (err) { setError(err.message || 'Could not update the account'); setBusy(false); }
  };
  return (
    <SettlementModal
      title={active ? `Switch off @${user.username}?` : `Switch on @${user.username}?`}
      subtitle={active ? 'They will not be able to log in until switched on again.' : 'They will be able to log in again with their PIN.'}
      onClose={onClose} busy={busy}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Your own login PIN (to confirm)">
          <input className="adm-input w-full tracking-[0.4em]" type="password" inputMode="numeric" maxLength={6} autoComplete="off" value={mine} onChange={e => setMine(e.target.value.replace(/\D/g, '').slice(0, 6))} autoFocus />
        </Field>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="adm-btn adm-btn-ghost">Cancel</button>
          <button type="submit" disabled={busy} className={`adm-btn ${active ? 'adm-btn-danger' : 'adm-btn-primary'}`}>{busy ? 'Saving…' : active ? 'Switch off' : 'Switch on'}</button>
        </div>
      </form>
    </SettlementModal>
  );
}
