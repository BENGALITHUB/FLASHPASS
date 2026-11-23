import React from 'react';

/**
 * Shared premium landing-page primitives (same look as EventShowcaseCard / PartnerOfferCard).
 */

// Centered section header: glowing pill, big comic heading, muted subtitle.
// `title` may contain React nodes for colored words.
export function SectionHeader({ icon: Icon, eyebrow, title, subtitle, tone = 'primary' }) {
  const toneCls = {
    primary: 'border-primary/60 text-primary',
    accent: 'border-accent/60 text-accent',
    info: 'border-info/60 text-info'
  }[tone];
  return (
    <div className="text-center mb-10 space-y-3">
      <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-2 border-2 font-mono text-[11px] font-bold uppercase tracking-wider shadow-[2px_2px_0_#000] ${toneCls}`}>
        {Icon && <Icon className="w-3.5 h-3.5" />} {eyebrow}
      </span>
      <h2 className="font-comic text-4xl sm:text-6xl text-white tracking-wide uppercase drop-shadow-[4px_4px_0_#000]">
        {title}
      </h2>
      {subtitle && <p className="text-sm text-text-muted max-w-xl mx-auto">{subtitle}</p>}
    </div>
  );
}

// Gradient-bordered glowing card with themed wash, halftone and a faded watermark icon.
export function PremiumPanel({ a, b, watermark: Watermark, className = '', innerClassName = '', glow = true, children }) {
  return (
    <div className={`relative group h-full ${className}`}>
      {glow && (
        <div
          className="absolute -inset-2 rounded-[2rem] blur-2xl opacity-15 group-hover:opacity-35 transition-opacity duration-500"
          style={{ background: `linear-gradient(120deg, ${a}, ${b})` }}
        />
      )}
      <div
        className="relative h-full rounded-[1.5rem] p-[2px] shadow-[6px_6px_0_#000] transition-transform duration-300 group-hover:-translate-y-1"
        style={{ background: `linear-gradient(135deg, ${a}, ${b} 60%, ${a})` }}
      >
        <div className="relative h-full rounded-[calc(1.5rem-2px)] bg-[#0D0D1A] overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.14] pointer-events-none"
            style={{ background: `radial-gradient(circle at 0% 0%, ${a}, transparent 55%), radial-gradient(circle at 100% 100%, ${b}, transparent 50%)` }}
          />
          <div className="absolute inset-0 bg-halftone opacity-30 pointer-events-none" />
          {Watermark && (
            <Watermark
              className="absolute -right-6 -top-6 w-40 h-40 pointer-events-none opacity-[0.06] rotate-12"
              style={{ color: a }}
              aria-hidden="true"
            />
          )}
          <div className={`relative h-full ${innerClassName}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}

// Gradient icon tile used in panel headers.
export function IconTile({ icon: Icon, a, b, size = 'md' }) {
  const s = size === 'compact' ? 'w-8 h-8 sm:w-10 sm:h-10' : size === 'sm' ? 'w-10 h-10' : 'w-12 h-12';
  const i = size === 'compact' ? 'w-4 h-4 sm:w-5 sm:h-5' : size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';
  return (
    <div
      className={`${s} rounded-xl flex items-center justify-center border-2 border-black shadow-[3px_3px_0_#000] shrink-0 text-black`}
      style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
    >
      <Icon className={i} />
    </div>
  );
}
