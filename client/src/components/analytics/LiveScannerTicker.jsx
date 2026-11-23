import React from 'react';
import { Radio, CheckCircle2, AlertTriangle, ArrowRight, XCircle } from 'lucide-react';

export default function LiveScannerTicker({ scans = [] }) {
  // Real scans only. An empty list means no gate has scanned yet.
  const displayScans = scans;

  return (
    <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-success/20 border border-success flex items-center justify-center">
            <Radio className="w-4 h-4 text-success animate-pulse" />
          </div>
          <div>
            <h3 className="font-comic text-xl text-text leading-tight tracking-wide">
              LIVE GATE SCAN STREAM
            </h3>
            <p className="font-mono text-[11px] text-text-muted">
              Sub-150ms real-time attendee ingress event log
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-mono text-success">
          <span className="w-2.5 h-2.5 rounded-full bg-success animate-ping"></span>
          <span>LIVE FEED ACTIVE</span>
        </div>
      </div>

      {/* Ticker Stream Rows */}
      <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
        {displayScans.length === 0 && (
          <div className="p-4 rounded-2xl bg-surface-2/80 border border-border text-center font-mono text-xs text-text-muted">
            No scans yet. Entries will appear here as gates scan passes.
          </div>
        )}
        {displayScans.map((s, idx) => {
          const isEntry = s.direction === 'ENTRY';
          const isOk = s.result === 'ENTRY_OK' || s.result === 'EXIT_OK';
          const isFraud = s.result === 'ALREADY_INSIDE' || s.result === 'ALREADY_USED_TODAY';

          return (
            <div
              key={s._id || idx}
              className={`p-3 rounded-2xl border flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 transition-colors ${
                isFraud
                  ? 'bg-danger/10 border-danger/50 shadow-[0_0_12px_rgba(255,46,136,0.25)]'
                  : 'bg-surface-2/80 border-border hover:bg-surface-2'
              }`}
            >
              {/* Left: Attendee Avatar & Identity */}
              <div className="flex items-center gap-3 min-w-[200px]">
                {s.photoUrl ? (
                  <img
                    src={s.photoUrl}
                    alt={s.holderName}
                    className="w-10 h-10 rounded-xl object-cover border-2 border-black shadow-[1px_1px_0_#000] flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-surface border border-border flex items-center justify-center font-bold text-text font-comic text-lg flex-shrink-0">
                    {s.holderName?.charAt(0) || 'A'}
                  </div>
                )}
                <div>
                  <span className="text-xs font-bold text-text font-mono block leading-none">
                    {s.holderName}
                  </span>
                  <span className="text-[10px] font-mono text-text-muted block mt-1">
                    Pass: <strong className="text-primary">{s.orderId}</strong>
                  </span>
                </div>
              </div>

              {/* Middle: Gate & Time */}
              <div className="font-mono text-xs text-text-muted">
                <span className="text-text block font-bold">{s.gateId}</span>
                <span className="text-[10px] block">{s.time}</span>
              </div>

              {/* Right: Direction & Result Pill */}
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded-lg font-mono text-[10px] font-bold uppercase border ${
                    isEntry ? 'bg-info/20 text-info border-info/40' : 'bg-surface text-text-muted border-border'
                  }`}
                >
                  {s.direction}
                </span>

                <span
                  className={`px-2.5 py-1 rounded-xl font-mono text-[11px] font-bold uppercase border flex items-center gap-1 ${
                    s.result === 'ENTRY_OK'
                      ? 'bg-success/20 text-success border-success'
                      : s.result === 'EXIT_OK'
                      ? 'bg-info/20 text-info border-info'
                      : 'bg-danger text-white border-black animate-pulse'
                  }`}
                >
                  {isOk ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  <span>{s.result?.replace(/_/g, ' ')}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

