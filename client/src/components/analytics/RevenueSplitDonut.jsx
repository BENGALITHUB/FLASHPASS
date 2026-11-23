import React from 'react';
import { DollarSign, CreditCard, Banknote, PieChart } from 'lucide-react';

export default function RevenueSplitDonut({ channelData }) {
  const onlineGross = Number(channelData?.online?.grossRupees || 0);
  const cashGross = Number(channelData?.cash?.grossRupees || 0);
  const totalGross = onlineGross + cashGross || 1;

  const onlinePct = Math.round((onlineGross / totalGross) * 100);
  const cashPct = 100 - onlinePct;

  // SVG Donut params
  const radius = 54;
  const circumference = 2 * Math.PI * radius; // ~339.29
  const onlineOffset = 0;
  const onlineStroke = (onlinePct / 100) * circumference;
  const cashStroke = circumference - onlineStroke;

  return (
    <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000] flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/20 border border-primary flex items-center justify-center">
              <PieChart className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="font-comic text-xl text-text leading-tight tracking-wide">
                CHANNEL REVENUE MIX
              </h3>
              <p className="font-mono text-[11px] text-text-muted">
                Online Instant UPI vs Spot Box Office Cash
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-2 border border-border text-primary font-bold">
            Total: ₹{(onlineGross + cashGross).toFixed(2)}
          </span>
        </div>

        {/* SVG Donut & Channel Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center my-2">
          {/* Donut Chart */}
          <div className="relative flex items-center justify-center">
            <svg width="150" height="150" viewBox="0 0 150 150" className="transform -rotate-90">
              {/* Background circle */}
              <circle
                cx="75"
                cy="75"
                r={radius}
                fill="transparent"
                stroke="#1B1B2A"
                strokeWidth="18"
              />
              {/* Online segment (Cyan) */}
              <circle
                cx="75"
                cy="75"
                r={radius}
                fill="transparent"
                stroke="#22D3EE"
                strokeWidth="18"
                strokeDasharray={`${onlineStroke} ${circumference}`}
                strokeDashoffset="0"
                strokeLinecap="round"
                className="transition-all duration-700"
              />
              {/* Cash segment (Yellow) */}
              <circle
                cx="75"
                cy="75"
                r={radius}
                fill="transparent"
                stroke="#FFD60A"
                strokeWidth="18"
                strokeDasharray={`${cashStroke} ${circumference}`}
                strokeDashoffset={`-${onlineStroke}`}
                className="transition-all duration-700"
              />
            </svg>

            {/* Inner Center Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-comic text-2xl text-text leading-none">{onlinePct}%</span>
              <span className="font-mono text-[9px] text-text-muted uppercase tracking-wider">Online</span>
            </div>
          </div>

          {/* Channel Breakdown Cards */}
          <div className="space-y-2.5 font-mono text-xs">
            {/* Online UPI */}
            <div className="p-3 rounded-xl bg-surface-2 border border-info/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-info/20 text-info flex items-center justify-center">
                  <CreditCard className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-text block">Online UPI</span>
                  <span className="text-[10px] text-text-muted">{channelData?.online?.ordersCount || 0} passes</span>
                </div>
              </div>
              <div className="text-right">
                <span className="font-bold text-info block">₹{onlineGross.toFixed(2)}</span>
                <span className="text-[10px] text-text-muted">{onlinePct}% share</span>
              </div>
            </div>

            {/* Box Office Cash */}
            <div className="p-3 rounded-xl bg-surface-2 border border-primary/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                  <Banknote className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-bold text-text block">Spot Cash (POS)</span>
                  <span className="text-[10px] text-text-muted">{channelData?.cash?.ordersCount || 0} tokens</span>
                </div>
              </div>
              <div className="text-right">
                <span className="font-bold text-primary block">₹{cashGross.toFixed(2)}</span>
                <span className="text-[10px] text-text-muted">{cashPct}% share</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Breakdown */}
      <div className="mt-3 pt-3 border-t border-border flex justify-between font-mono text-[11px] text-text-muted">
        <span>Organizer Share: ₹{(Number(channelData?.online?.organizerShareRupees || 0) + Number(channelData?.cash?.organizerShareRupees || 0)).toFixed(2)}</span>
        <span className="text-info font-bold">Platform Fee: ₹{(Number(channelData?.online?.platformFeeRupees || 0) + Number(channelData?.cash?.platformFeeRupees || 0)).toFixed(2)}</span>
      </div>
    </div>
  );
}

