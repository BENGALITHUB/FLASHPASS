import React from 'react';
import { Calendar, DollarSign, Users, ChevronRight, Sparkles, Building2, Ticket } from 'lucide-react';
import ComicButton from '../common/ComicButton';

export default function EventComparisonCards({ eventsBreakdown = [], selectedEventId = 'ALL', onSelectEvent }) {
  if (!eventsBreakdown || eventsBreakdown.length === 0) return null;

  return (
    <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000] space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent flex items-center justify-center shadow-[2px_2px_0_#000]">
            <Building2 className="w-4 h-4 text-accent" />
          </div>
          <div>
            <h3 className="font-comic text-xl text-text leading-tight tracking-wide">
              MULTI-EVENT REVENUE & AUDIENCE BREAKDOWN
            </h3>
            <p className="font-mono text-[11px] text-text-muted">
              Live financial comparison across all active client events
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelectEvent('ALL')}
            className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all border ${
              selectedEventId === 'ALL'
                ? 'bg-primary text-black border-black shadow-[2px_2px_0_#000]'
                : 'bg-surface-2 text-text-muted hover:text-text border-border'
            }`}
          >
            🌐 All Events (Aggregated)
          </button>
        </div>
      </div>

      {/* Event Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {eventsBreakdown.map((ev) => {
          const isSelected = selectedEventId === ev.eventId;
          return (
            <div
              key={ev.eventId}
              onClick={() => onSelectEvent(ev.eventId)}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                isSelected
                  ? 'bg-gradient-to-b from-primary/10 via-surface-2 to-surface border-primary shadow-[4px_4px_0_#000]'
                  : 'bg-surface-2/80 hover:bg-surface-2 border-border hover:border-text-muted'
              }`}
            >
              {/* Event Header & Status */}
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-success/20 text-success border border-success/40">
                    {ev.status}
                  </span>
                  {isSelected && (
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary text-black border border-black shadow-[1px_1px_0_#000]">
                      ★ ACTIVE SCOPE
                    </span>
                  )}
                </div>

                <h4 className="font-comic text-xl text-text mb-0.5 leading-snug">{ev.name}</h4>
                <p className="font-mono text-[11px] text-text-muted mb-3 truncate">{ev.venue}</p>

                {/* Financial 3-Grid */}
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-surface border border-border mb-3 font-mono text-center">
                  <div>
                    <span className="text-[9px] text-text-muted uppercase block">Gross Sale</span>
                    <strong className="text-xs text-text font-bold block">₹{ev.grossRupees}</strong>
                  </div>
                  <div className="border-x border-border/70">
                    <span className="text-[9px] text-text-muted uppercase block">Organizer</span>
                    <strong className="text-xs text-primary font-bold block">₹{ev.organizerRupees}</strong>
                  </div>
                  <div>
                    <span className="text-[9px] text-info uppercase block font-bold">Platform Fee</span>
                    <strong className="text-xs text-info font-bold block">+₹{ev.platformFeeRupees}</strong>
                  </div>
                </div>

                {/* Passes & Capacity Progress */}
                <div className="space-y-1 text-[11px] font-mono text-text-muted mb-3">
                  <div className="flex justify-between">
                    <span>Sold Passes:</span>
                    <strong className="text-text">{ev.totalOrders} tickets</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Inside Now:</span>
                    <strong className="text-text">{ev.insideNow} / {ev.capacityLimit} ({ev.capacityPct}%)</strong>
                  </div>
                  <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden border border-border/60">
                    <div
                      className="h-full bg-info rounded-full transition-all"
                      style={{ width: `${Math.min(100, ev.capacityPct)}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs font-mono font-bold">
                <span className={isSelected ? 'text-primary' : 'text-text-muted'}>
                  {isSelected ? '✓ Viewing This Event' : 'Switch to this event'}
                </span>
                <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? 'text-primary translate-x-1' : 'text-text-muted'}`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

