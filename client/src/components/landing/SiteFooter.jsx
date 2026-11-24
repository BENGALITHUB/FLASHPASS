import React from 'react';
import { Link } from 'react-router-dom';
import { Ticket, QrCode, Zap, Layers, Sparkles, ShieldCheck, ChevronRight, MapPin, MessageCircle } from 'lucide-react';
import { PremiumPanel } from './Premium';

// Optional WhatsApp community invite link (set VITE_WHATSAPP_COMMUNITY_URL to show the card)
const COMMUNITY_URL = import.meta.env.VITE_WHATSAPP_COMMUNITY_URL;

// Shared site footer (landing + organizers pages)
export default function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-[#08080F] px-4 sm:px-6 pt-16 pb-32">
      {/* Rainbow top edge + ambient glows */}
      <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-primary via-accent to-info" />
      <div className="pointer-events-none absolute -top-40 -left-32 w-[520px] h-[420px] rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -top-40 -right-32 w-[520px] h-[420px] rounded-full bg-info/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-halftone opacity-20" />

      <div className="relative max-w-6xl mx-auto">
        {/* CTA band */}
        <PremiumPanel a="#FFD60A" b="#FF2E88" watermark={Ticket} innerClassName="p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5">
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Gates are open</span>
            <h3 className="font-comic text-3xl sm:text-5xl text-white uppercase tracking-wide leading-none drop-shadow-[3px_3px_0_#000]">
              Grab your <span className="text-primary">FlashPass</span> now
            </h3>
            <p className="text-sm text-text-muted">30-second checkout. Instant digital pass. Zero queues at the gate.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link
              to="/buy"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-primary text-black font-comic text-xl tracking-wide border-2 border-black shadow-[4px_4px_0_#000] hover:-translate-y-0.5 hover:shadow-[5px_6px_0_#000] active:translate-y-0.5 active:shadow-[2px_2px_0_#000] transition-all"
            >
              <Ticket className="w-5 h-5" /> Buy tickets
            </Link>
            <Link
              to="/my-ticket"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white/5 text-white font-comic text-xl tracking-wide border-2 border-white/20 shadow-[4px_4px_0_#000] hover:border-accent hover:text-accent hover:-translate-y-0.5 transition-all"
            >
              <QrCode className="w-5 h-5" /> My ticket
            </Link>
          </div>
        </PremiumPanel>

        {/* Columns */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-10 mt-14 mb-12">
          {/* Brand & overview */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 bg-gradient-to-br from-primary to-exit border-2 border-black rounded-xl flex items-center justify-center shadow-[3px_3px_0_#000] -rotate-6">
                <Zap className="w-6 h-6 text-black fill-black" />
              </div>
              <span className="font-comic text-4xl text-primary tracking-wider drop-shadow-[3px_3px_0_#000]">FLASHPASS</span>
            </div>
            <p className="text-sm text-text-muted leading-relaxed max-w-sm">
              The high-throughput, anti-fraud event ticketing and gate ingress operating system. Built for comic-cons, music festivals, college fests and crowded venues.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/40 font-mono text-[10px] font-bold uppercase tracking-wider text-success">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              All systems operational • 99.9% uptime target
            </div>
            {COMMUNITY_URL && (
              <a
                href={COMMUNITY_URL}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 max-w-sm p-3 rounded-2xl bg-success/10 border-2 border-success/40 hover:border-success hover:-translate-y-0.5 transition-all"
              >
                <span className="w-10 h-10 rounded-xl bg-success text-black flex items-center justify-center border-2 border-black shadow-[2px_2px_0_#000] shrink-0">
                  <MessageCircle className="w-5 h-5" />
                </span>
                <span>
                  <span className="block font-comic text-lg text-white tracking-wide leading-tight">Join our WhatsApp community</span>
                  <span className="block text-xs text-text-muted">First to know about new events & early-bird drops</span>
                </span>
              </a>
            )}
          </div>

          {[
            {
              title: 'Modules', icon: Layers, color: '#FFD60A',
              links: [
                ['/buy', 'Online Purchase (M1)'], ['/my-ticket', 'PWA Pass & PDF (M2)'], ['/my-ticket', 'Pass Recovery (M3)'],
                ['/cash', 'Venue Cash Token (M4)'], ['/pos', 'Box Office POS (M5)'], ['/gate', 'Gate Scanner (M6)'], ['/admin', 'Admin & Ledger (M7, M8)']
              ]
            },
            {
              title: 'Live demos', icon: Sparkles, color: '#FF2E88',
              links: [
                ['/buy', 'Ticket Checkout'], ['/cash', 'Cash Token Desk'], ['/gate', 'Gate Camera Scanner'],
                ['/pos', 'Cashier Keyboard POS'], ['/admin', 'Live Admin Dashboard'], ['/organizers', 'Host Your Event'], ['/staff', 'Staff Device Login']
              ]
            }
          ].map(({ title, icon: Icon, color, links }) => (
            <div key={title} className="space-y-3">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4" style={{ color }} />
                <strong className="font-comic text-xl text-white uppercase tracking-wide leading-none">{title}</strong>
              </div>
              <div className="h-0.5 w-10 rounded-full" style={{ background: color }} />
              <ul className="space-y-2">
                {links.map(([to, label]) => (
                  <li key={label}>
                    <Link
                      to={to}
                      className="group/link inline-flex items-center gap-1 text-[13px] text-text-muted hover:text-white transition-colors"
                    >
                      <ChevronRight
                        className="w-3.5 h-3.5 -ml-1 opacity-0 -translate-x-1 group-hover/link:opacity-100 group-hover/link:translate-x-0 transition-all"
                        style={{ color }}
                      />
                      <span className="-ml-2.5 group-hover/link:ml-0 transition-all">{label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Architecture chips */}
          <div className="col-span-2 md:col-span-1 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-info" />
              <strong className="font-comic text-xl text-white uppercase tracking-wide leading-none">Architecture</strong>
            </div>
            <div className="h-0.5 w-10 rounded-full bg-info" />
            <div className="flex flex-wrap gap-1.5">
              {['HMAC-SHA256 Token', 'Atomic Anti-Passback', 'WebSocket (Socket.io)', 'MongoDB Replica Set', '90-Day PII Anonymization', 'WCAG AA Contrast Safe'].map((t) => (
                <span key={t} className="px-2 py-1 rounded-lg bg-info/10 border border-info/30 font-mono text-[10px] text-info/90 hover:bg-info/20 transition-colors">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Giant wordmark */}
        <div
          aria-hidden="true"
          className="font-comic text-[18vw] lg:text-[13rem] leading-[0.8] text-center tracking-wider select-none bg-gradient-to-b from-white/[0.09] to-transparent bg-clip-text text-transparent -mb-4"
        >
          FLASHPASS
        </div>

        {/* Bottom credits & copyright */}
        <div className="relative pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-[11px] text-text-muted">
          <div>© 2026 FlashPass Inc. All rights reserved. • Powered by MERN Stack</div>
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-accent" />
            <span>Client showcase: <span className="text-white">Kolkata Comics Karnival 7.0</span></span>
          </div>
        </div>
      </div>
    </footer>
  );
}
