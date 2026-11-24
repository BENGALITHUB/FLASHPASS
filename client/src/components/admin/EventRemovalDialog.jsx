import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Loader2, Trash2, X } from 'lucide-react';
import { api } from '../../services/api';

const COPY = {
  delete: {
    title: 'Delete event',
    intro: 'This removes the event for good. It only works for an event that has never sold a ticket. Its organizer and staff logins are switched off.',
    button: 'Delete event',
    icon: Trash2
  },
  archive: {
    title: 'Archive event',
    intro: 'The event is hidden from the public site and online and cash sales stop. Orders, passes and settlements are kept, and passes already sold still work at the gate.',
    button: 'Archive event',
    icon: EyeOff
  },
  restore: {
    title: 'Restore event',
    intro: 'The event shows on the public site again. Sales stay off until you switch them on in the event settings.',
    button: 'Restore event',
    icon: Eye
  }
};

/**
 * Super Admin dialog to delete, archive or restore one event. Every action asks for the
 * admin's own PIN; a delete also asks for the event ID typed back. If the event has sales,
 * the delete is refused and the dialog offers to archive it instead.
 */
export default function EventRemovalDialog({ event, mode: initialMode, onClose, onDone }) {
  const [mode, setMode] = useState(initialMode);
  const [confirmId, setConfirmId] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const firstField = useRef(null);
  const copy = COPY[mode];
  const Icon = copy.icon;
  const idMatches = confirmId.trim().toLowerCase() === event.eventId;
  const canSubmit = pin.length === 6 && (mode !== 'delete' || idMatches) && !busy;

  useEffect(() => { firstField.current?.focus(); }, [mode]);

  const submit = async e => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result = mode === 'delete'
        ? await api.adminDeleteEvent(event.eventId, confirmId.trim(), pin)
        : await api.adminSetEventArchived(event.eventId, mode === 'archive', pin);
      onDone(result.message);
    } catch (err) {
      setError({ message: err.message || 'Something went wrong', code: err.code });
      if (err.code === 'INVALID_PIN') setPin('');
    } finally {
      setBusy(false);
    }
  };

  const switchToArchive = () => {
    setMode('archive');
    setError(null);
  };

  return (
    <div
      className="responsive-dialog adm-modal-backdrop fixed inset-0 z-[70] flex items-start justify-center p-4 overflow-y-auto overscroll-contain"
      onKeyDown={e => { if (e.key === 'Escape' && !busy) onClose(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="event-removal-title" className="adm-modal relative w-full max-w-md my-16 rounded-3xl p-px">
        <div className="adm-modal-inner relative overflow-hidden rounded-[23px]">
          <div className="relative flex items-start justify-between gap-4 px-6 pt-6 pb-5 border-b border-white/[0.08]">
            <div className="flex items-center gap-3.5">
              <span className={`adm-icon-tile h-11 w-11 shrink-0 rounded-2xl ${mode === 'delete' ? 'adm-icon-tile-magenta' : 'adm-icon-tile-cyan'}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 id="event-removal-title" className="font-comic text-2xl tracking-wide text-white leading-none">{copy.title}</h3>
                <p className="mt-1.5 font-mono text-[11px] text-text-muted">{event.name} · <span className="text-info">{event.eventId}</span></p>
              </div>
            </div>
            <button type="button" onClick={onClose} disabled={busy} className="adm-icon-btn shrink-0" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={submit} className="relative p-6 space-y-4" noValidate>
            <p className="font-mono text-xs leading-relaxed text-text-muted">{copy.intro}</p>

            {mode === 'delete' && (
              <div>
                <label htmlFor="event-removal-id" className="adm-label">Type <strong className="text-white">{event.eventId}</strong> to confirm</label>
                <input
                  id="event-removal-id" ref={firstField} type="text" autoComplete="off" spellCheck={false}
                  value={confirmId} disabled={busy} onChange={e => setConfirmId(e.target.value)}
                  className="adm-input font-mono"
                />
              </div>
            )}

            <div>
              <label htmlFor="event-removal-pin" className="adm-label">Your 6-digit admin PIN</label>
              <input
                id="event-removal-pin" ref={mode === 'delete' ? undefined : firstField} type="password" inputMode="numeric"
                autoComplete="off" maxLength={6} value={pin} disabled={busy}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                className="adm-input font-mono tracking-[0.4em]"
              />
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-exit/30 bg-exit/10 px-3 py-2.5 font-mono text-[11px] text-exit">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="space-y-2">
                  <p>{error.message}</p>
                  {error.code === 'EVENT_HAS_SALES' && (
                    <button type="button" className="adm-btn adm-btn-cyan adm-btn-sm" onClick={switchToArchive}>
                      <EyeOff className="h-3.5 w-3.5" /> Archive instead
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" className="adm-btn adm-btn-ghost flex-1 justify-center" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" disabled={!canSubmit} className={`adm-btn flex-1 justify-center ${mode === 'delete' ? 'adm-btn-danger' : 'adm-btn-cyan'}`}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />} {copy.button}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
