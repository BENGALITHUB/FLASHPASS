import React from 'react';
import { Shield, ArrowUpRight, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function GateCongestionHeatmap({ distribution = [] }) {
  // Real gate counts only: gates that have scanned, busiest first
  const gates = distribution;

  return (
    <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000] flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent flex items-center justify-center">
              <Shield className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h3 className="font-comic text-xl text-text leading-tight tracking-wide">
                GATE CONGESTION RADAR
              </h3>
              <p className="font-mono text-[11px] text-text-muted">
                Real-time gate load distribution & throughput balancing
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-2 border border-border text-text-muted">
            {gates.length} {gates.length === 1 ? 'gate' : 'gates'} scanning
          </span>
        </div>

        {/* Gate Progress Rows */}
        <div className="space-y-3.5">
          {gates.length === 0 && (
            <div className="p-4 rounded-2xl bg-surface-2/80 border border-border text-center font-mono text-xs text-text-muted">
              No gate has scanned yet.
            </div>
          )}
          {gates.map((g, idx) => {
            const isHigh = g.sharePct >= 40;
            const isModerate = g.sharePct >= 20 && g.sharePct < 40;

            const colorClass = isHigh
              ? 'bg-danger text-danger border-danger'
              : isModerate
              ? 'bg-warning text-warning border-warning'
              : 'bg-success text-success border-success';

            const barColor = isHigh ? 'bg-danger' : isModerate ? 'bg-warning' : 'bg-success';

            return (
              <div key={idx} className="p-3 rounded-2xl bg-surface-2/80 border border-border">
                <div className="flex justify-between items-center mb-1.5 font-mono text-xs">
                  <div className="flex items-center gap-2">
                    <strong className="text-text font-bold">{g.gate}</strong>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-text-muted">{g.scans} scans</span>
                    <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] border ${colorClass} bg-opacity-15`}>
                      {g.sharePct}% Load
                    </span>
                  </div>
                </div>

                {/* Meter Bar */}
                <div className="w-full h-2.5 bg-surface rounded-full overflow-hidden border border-border/70 p-[1px]">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${Math.min(100, g.sharePct * 1.8)}%` }}
                  ></div>
                </div>

                <div className="flex justify-between items-center mt-1.5 text-[10px] font-mono text-text-muted">
                  <span>{g.sharePct}% of all scans</span>
                  <span className="flex items-center gap-1">
                    {isHigh ? (
                      <span className="text-danger flex items-center gap-1 font-bold">
                        <AlertCircle className="w-3 h-3" /> Heavy Queue (Deploy staff)
                      </span>
                    ) : (
                      <span className="text-success flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Smooth Flow
                      </span>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border/80 flex items-center justify-between text-[11px] font-mono text-text-muted">
        <span>Counts successful entry and exit scans</span>
        <span className="text-primary font-bold">{gates.reduce((sum, g) => sum + g.scans, 0)} total</span>
      </div>
    </div>
  );
}

