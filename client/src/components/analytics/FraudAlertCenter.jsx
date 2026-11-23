import React from 'react';
import { ShieldAlert, AlertTriangle, XCircle, Clock, MapPin } from 'lucide-react';

export default function FraudAlertCenter({ incidents = [] }) {
  // Real incidents only. An empty list means nothing was flagged.
  const displayIncidents = incidents;

  return (
    <div className="p-5 rounded-3xl bg-surface border-2 border-danger/40 shadow-[4px_4px_0_#000]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-danger/20 border border-danger flex items-center justify-center">
            <ShieldAlert className="w-4 h-4 text-danger animate-pulse" />
          </div>
          <div>
            <h3 className="font-comic text-xl text-danger leading-tight tracking-wide">
              ANTI-FRAUD & INCIDENT MONITOR
            </h3>
            <p className="font-mono text-[11px] text-text-muted">
              Duplicate screenshot flags & rejected access violations
            </p>
          </div>
        </div>

        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-danger/20 text-danger border border-danger/40">
          {displayIncidents.length} Incident(s) Logged
        </span>
      </div>

      <div className="space-y-2.5">
        {displayIncidents.length === 0 && (
          <div className="p-4 rounded-2xl bg-success/10 border border-success/40 text-center font-mono text-xs text-success font-bold">
            ✓ No fraud attempts so far
          </div>
        )}
        {displayIncidents.map((inc, idx) => (
          <div
            key={inc._id || idx}
            className="p-3.5 rounded-2xl bg-danger/10 border-2 border-danger/40 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 shadow-[2px_2px_0_#000]"
          >
            <div className="flex items-center gap-3">
              {inc.photoUrl ? (
                <img
                  src={inc.photoUrl}
                  alt={inc.holderName}
                  className="w-11 h-11 rounded-xl object-cover border-2 border-black"
                />
              ) : (
                <div className="w-11 h-11 rounded-xl bg-danger/20 border border-danger flex items-center justify-center text-danger font-bold">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-danger uppercase font-mono">
                    🚨 {inc.result?.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] font-mono text-text-muted">
                    Pass: {inc.orderId}
                  </span>
                </div>
                <p className="text-xs text-text font-bold font-mono mt-0.5">
                  Holder: {inc.holderName}
                </p>
              </div>
            </div>

            <div className="font-mono text-[11px] text-text-muted text-right">
              <span className="flex items-center gap-1 justify-end text-text font-bold">
                <MapPin className="w-3 h-3 text-primary" /> {inc.gateId}
              </span>
              <span className="flex items-center gap-1 justify-end text-[10px] text-text-muted mt-0.5">
                <Clock className="w-3 h-3" /> {inc.time}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

