import React from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';

/**
 * Premium partnership offer card (sponsor / stall), styled to match EventShowcaseCard.
 * `offer` shape: { theme: {a, b, text, btn}, icon, badge, kicker, title, description,
 *                  stats: [{value, label}], perks: [{title, text}], cta, footnote }
 */
export default function PartnerOfferCard({ offer, onClick }) {
  const { theme, icon: Icon } = offer;

  return (
    <article className="partner-offer relative group h-full min-w-0">
      <div
        className="absolute -inset-2 rounded-[2rem] blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-500"
        style={{ background: `linear-gradient(120deg, ${theme.a}, ${theme.b})` }}
      />

      <div
        className="relative h-full rounded-[1.75rem] p-[2px] shadow-[8px_8px_0_#000] transition-transform duration-300 group-hover:-translate-y-1"
        style={{ background: `linear-gradient(135deg, ${theme.a}, ${theme.b} 60%, ${theme.a})` }}
      >
        <div className="relative h-full rounded-[calc(1.75rem-2px)] bg-[#0D0D1A] overflow-hidden flex flex-col">
          {/* Themed art */}
          <div
            className="absolute inset-0 opacity-[0.16] pointer-events-none"
            style={{ background: `radial-gradient(circle at 0% 0%, ${theme.a}, transparent 50%), radial-gradient(circle at 100% 100%, ${theme.b}, transparent 45%)` }}
          />
          <div className="absolute inset-0 bg-halftone opacity-30 pointer-events-none" />
          <Icon
            className="absolute -right-8 -top-8 w-56 h-56 pointer-events-none opacity-[0.06] rotate-12"
            style={{ color: theme.a }}
            aria-hidden="true"
          />

          <div className="relative p-4 sm:p-6 xl:p-8 flex-1 flex flex-col">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border-2 border-black shadow-[2px_2px_0_#000] font-mono text-[10px] font-bold uppercase tracking-wider text-black"
                style={{ background: theme.a }}
              >
                ★ {offer.badge}
              </span>
              <span className="font-mono text-[11px] font-bold uppercase tracking-wider" style={{ color: theme.a }}>
                {offer.kicker}
              </span>
            </div>

            <div className="mt-5 flex items-start gap-3">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center border-2 border-black shadow-[3px_3px_0_#000] shrink-0 text-black"
                style={{ background: `linear-gradient(135deg, ${theme.a}, ${theme.b})` }}
              >
                <Icon className="w-7 h-7" />
              </div>
              <h3
                className="font-comic text-3xl sm:text-4xl uppercase tracking-wide leading-[0.95]"
                style={{ color: theme.text, textShadow: `3px 3px 0 #000, 5px 5px 0 ${theme.b}55` }}
              >
                {offer.title}
              </h3>
            </div>

            <p className="mt-4 text-sm text-text-muted leading-relaxed">{offer.description}</p>

            {/* Stats */}
            <div className="mt-5 grid grid-cols-3 gap-2">
              {offer.stats.map(({ value, label }) => (
                <div key={label} className="rounded-xl bg-black/30 border border-white/10 min-w-0 px-2 sm:px-3 py-2">
                  <div className="font-comic text-lg sm:text-2xl [overflow-wrap:anywhere] text-white leading-tight">{value}</div>
                  <div className="font-mono text-[10px] uppercase text-text-muted">{label}</div>
                </div>
              ))}
            </div>

            {/* Perks */}
            <ul className="mt-5 space-y-2.5 flex-1">
              {offer.perks.map((perk) => (
                <li key={perk.title} className="flex items-start gap-3 p-3 rounded-2xl bg-[#14142A]/90 border border-white/10 hover:border-white/25 transition-colors">
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" style={{ color: theme.a }} />
                  <div>
                    <div className="text-sm font-bold text-text">{perk.title}</div>
                    <div className="text-xs text-text-muted leading-relaxed">{perk.text}</div>
                  </div>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <div className="mt-6 pt-5 border-t border-white/10">
              <button
                type="button"
                onClick={onClick}
                className={`w-full inline-flex items-center justify-center gap-2 font-comic text-xl tracking-wider px-5 py-3 rounded-xl border-2 border-black shadow-[4px_4px_0_#000] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_#000] transition-all cursor-pointer ${theme.btn}`}
              >
                <Icon className="w-5 h-5" />
                {offer.cta}
                <ArrowRight className="w-5 h-5" />
              </button>
              <p className="mt-2.5 text-center text-[10px] font-mono text-text-muted">{offer.footnote}</p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
