import React, { useState } from 'react';
import { Activity, TrendingUp, Users } from 'lucide-react';

export default function IngressVelocityChart({ data = [] }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Before data loads, draw a flat zero line over the same hours (never made-up numbers)
  const points = data.length > 0 ? data : Array.from({ length: 14 }, (_, i) => ({
    hour: `${String(9 + i).padStart(2, '0')}:00`, entries: 0, exits: 0
  }));
  const hasScans = points.some(p => (p.entries || 0) > 0 || (p.exits || 0) > 0);

  const maxVal = Math.max(...points.map(p => Math.max(p.entries || 0, p.exits || 0)), 100);

  // SVG dimensions
  const svgWidth = 680;
  const svgHeight = 220;
  const paddingLeft = 45;
  const paddingRight = 25;
  const paddingTop = 25;
  const paddingBottom = 40;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  // Calculate coordinates
  const entryCoords = points.map((p, idx) => {
    const x = paddingLeft + (idx / (points.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - ((p.entries || 0) / maxVal) * chartHeight;
    return { x, y, ...p };
  });

  const exitCoords = points.map((p, idx) => {
    const x = paddingLeft + (idx / (points.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - ((p.exits || 0) / maxVal) * chartHeight;
    return { x, y, ...p };
  });

  // Smooth Bezier Curve Path generator
  const createSmoothPath = (coords) => {
    if (coords.length === 0) return '';
    let d = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      const cp1x = p0.x + (p1.x - p0.x) / 2;
      const cp1y = p0.y;
      const cp2x = p0.x + (p1.x - p0.x) / 2;
      const cp2y = p1.y;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
    }
    return d;
  };

  const entryLinePath = createSmoothPath(entryCoords);
  const exitLinePath = createSmoothPath(exitCoords);

  // Closed area paths for gradient fill
  const entryAreaPath = `${entryLinePath} L ${entryCoords[entryCoords.length - 1].x} ${paddingTop + chartHeight} L ${entryCoords[0].x} ${paddingTop + chartHeight} Z`;

  // Find peak hour
  const peak = points.reduce((prev, curr) => (curr.entries > prev.entries ? curr : prev), points[0]);

  return (
    <div className="p-5 rounded-3xl bg-surface border-2 border-border shadow-[4px_4px_0_#000]">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center mb-4 gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-info/20 border border-info flex items-center justify-center">
            <Activity className="w-4 h-4 text-info" />
          </div>
          <div>
            <h3 className="font-comic text-xl text-text leading-tight tracking-wide">
              HOURLY INGRESS & GATE VELOCITY
            </h3>
            <p className="font-mono text-[11px] text-text-muted">
              Live crowd rush curves • Bidirectional Entries vs Exits
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-info border border-black"></span>
            <span className="text-text font-bold">Entries In</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-accent border border-black"></span>
            <span className="text-text-muted font-bold">Exits Out</span>
          </div>
          <span className="bg-primary/20 text-primary px-2.5 py-1 rounded-lg border border-primary/40 font-bold text-[11px]">
            {hasScans ? `Peak: ${peak.hour} (${peak.entries}/hr)` : 'No scans yet'}
          </span>
        </div>
      </div>

      {/* Interactive SVG Chart */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto min-w-[540px] select-none"
        >
          <defs>
            {/* Glowing gradient for entries area */}
            <linearGradient id="entryGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#22D3EE" stopOpacity="0.0" />
            </linearGradient>

            {/* Glowing gradient for exits area */}
            <linearGradient id="exitGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF2E88" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#FF2E88" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
            const y = paddingTop + chartHeight * (1 - ratio);
            const val = Math.round(maxVal * ratio);
            return (
              <g key={idx}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke="#222238"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="#71719A"
                  fontSize="9"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Area under curves */}
          <path d={entryAreaPath} fill="url(#entryGrad)" />

          {/* Exits line (Magenta) */}
          <path
            d={exitLinePath}
            fill="none"
            stroke="#FF2E88"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Entries line (Cyan) */}
          <path
            d={entryLinePath}
            fill="none"
            stroke="#22D3EE"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Interactive Data Points & Hover Triggers */}
          {entryCoords.map((pt, idx) => {
            const isHovered = hoveredIndex === idx;
            return (
              <g
                key={idx}
                className="cursor-pointer"
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                {/* Invisible hover bar */}
                <rect
                  x={pt.x - 18}
                  y={paddingTop}
                  width="36"
                  height={chartHeight}
                  fill="transparent"
                />

                {/* Vertical hover line indicator */}
                {isHovered && (
                  <line
                    x1={pt.x}
                    y1={paddingTop}
                    x2={pt.x}
                    y2={paddingTop + chartHeight}
                    stroke="#FFD60A"
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                  />
                )}

                {/* Entry Dot */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? 6 : 3.5}
                  fill="#22D3EE"
                  stroke="#0E0E18"
                  strokeWidth="2"
                  className="transition-all"
                />

                {/* X Axis Hour Label */}
                <text
                  x={pt.x}
                  y={paddingTop + chartHeight + 20}
                  textAnchor="middle"
                  fill={isHovered ? '#FFD60A' : '#71719A'}
                  fontSize={isHovered ? '10' : '9'}
                  fontWeight={isHovered ? 'bold' : 'normal'}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {pt.hour}
                </text>
              </g>
            );
          })}

          {/* Tooltip Overlay */}
          {hoveredIndex !== null && entryCoords[hoveredIndex] && (
            <g
              transform={`translate(${
                Math.min(svgWidth - 110, Math.max(60, entryCoords[hoveredIndex].x))
              }, ${Math.max(15, entryCoords[hoveredIndex].y - 45)})`}
              className="pointer-events-none"
            >
              <rect
                x="-45"
                y="-18"
                width="90"
                height="36"
                rx="8"
                fill="#0E0E18"
                stroke="#FFD60A"
                strokeWidth="1.5"
              />
              <text
                x="0"
                y="-4"
                textAnchor="middle"
                fill="#22D3EE"
                fontSize="10"
                fontWeight="bold"
                fontFamily="JetBrains Mono, monospace"
              >
                In: {entryCoords[hoveredIndex].entries}
              </text>
              <text
                x="0"
                y="10"
                textAnchor="middle"
                fill="#FF2E88"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
              >
                Out: {exitCoords[hoveredIndex]?.exits || 0}
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

