import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { trackPageView } from './utils/analytics';

// The landing page ships in the main file. Every other page is its own file,
// downloaded only when opened, so a buyer's phone never downloads the admin
// panel, gate scanner or POS (SRS NFR-PF-02).
import LandingPage from './pages/LandingPage';

// A failed page download (weak network or new deployment) reloads once to fetch fresh manifest
const page = (load) => lazy(() =>
  load().catch((err) => {
    const key = 'fp_chunk_reload';
    if (typeof window !== 'undefined' && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      window.location.reload();
      return new Promise(() => {});
    }
    throw err;
  })
);

const CheckoutPage = page(() => import('./pages/CheckoutPage'));
const PaymentConfirmingPage = page(() => import('./pages/PaymentConfirmingPage'));
const PassPage = page(() => import('./pages/PassPage'));
const MyTicketPage = page(() => import('./pages/MyTicketPage'));
const CashTokenPage = page(() => import('./pages/CashTokenPage'));
const OrganizersPage = page(() => import('./pages/OrganizersPage'));

// Staff & Operations Pages
const StaffLoginPage = page(() => import('./pages/StaffLoginPage'));
const GateScannerPage = page(() => import('./pages/GateScannerPage'));
const BoxOfficePOSPage = page(() => import('./pages/BoxOfficePOSPage'));
const AdminDashboardPage = page(() => import('./pages/AdminDashboardPage'));

function PageLoading() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center" role="status" aria-label="Loading">
      <span className="h-10 w-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
    </div>
  );
}

const SITE_ORIGIN = (import.meta.env.VITE_SITE_URL || 'https://flashpass.bengalithub.com').replace(/\/+$/, '');

const ROUTE_SEO = {
  '/': {
    title: 'FlashPass — Kolkata Comics Karnival 7.0 & Instant Event Passes',
    description: 'Book Kolkata Comics Karnival 7.0 & live event passes in 30 seconds with UPI — instant digital QR pass, no app, zero gate queues.',
    robots: 'index, follow, max-image-preview:large',
    canonical: `${SITE_ORIGIN}/`
  },
  '/buy': {
    title: 'Book Event Passes — Kolkata Comics Karnival 7.0 | FlashPass',
    description: 'Book your 3-day pass for Kolkata Comics Karnival 7.0 at Khudiram Anushilan Kendra in 30 seconds with UPI or Card.',
    robots: 'index, follow',
    canonical: `${SITE_ORIGIN}/buy`
  },
  '/checkout': {
    title: 'Book Event Passes — Kolkata Comics Karnival 7.0 | FlashPass',
    description: 'Book your 3-day pass for Kolkata Comics Karnival 7.0 at Khudiram Anushilan Kendra in 30 seconds with UPI or Card.',
    robots: 'index, follow',
    canonical: `${SITE_ORIGIN}/buy`
  },
  '/organizers': {
    title: 'For Event Organizers — Zero-Queue Gate Ticketing | FlashPass',
    description: 'Run high-speed event ticketing, UPI checkout, Box Office POS, and sub-500ms anti-passback QR gate scanning with FlashPass.',
    robots: 'index, follow',
    canonical: `${SITE_ORIGIN}/organizers`
  },
  '/my-ticket': {
    title: 'Ticket Recovery — Find Your Digital Pass | FlashPass',
    description: 'Recover your FlashPass digital QR ticket anytime using your mobile number or order ID.',
    robots: 'index, follow',
    canonical: `${SITE_ORIGIN}/my-ticket`
  },
  '/cash': {
    title: 'Cash Counter Token — Pay at Venue Box Office | FlashPass',
    description: 'Generate a fast cash token and pay at the venue Box Office counter for instant QR pass issuance.',
    robots: 'index, follow',
    canonical: `${SITE_ORIGIN}/cash`
  }
};

const applyRouteSEO = (pathname) => {
  if (typeof document === 'undefined') return;
  const isPrivate = /^\/(admin|pos|gate|staff|order|pass)(\/|$)/.test(pathname);
  const meta = ROUTE_SEO[pathname] || (isPrivate
    ? {
        title: 'FlashPass — Pass & Operations Portal',
        description: 'FlashPass digital event pass and operations portal.',
        robots: 'noindex, nofollow',
        canonical: `${SITE_ORIGIN}${pathname}`
      }
    : ROUTE_SEO['/']);

  document.title = meta.title;
  const setMeta = (selector, attr, key, content) => {
    let el = document.head.querySelector(selector);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };
  setMeta('meta[name="description"]', 'name', 'description', meta.description);
  setMeta('meta[name="robots"]', 'name', 'robots', meta.robots);

  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', meta.canonical);
};

export default function App() {
  const location = useLocation();

  // SPA page views for analytics & dynamic per-route SEO metadata
  useEffect(() => {
    sessionStorage.removeItem('fp_chunk_reload');
    applyRouteSEO(location.pathname);
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  return (
    <Suspense fallback={<PageLoading />}>
    <Routes>
      {/* Attendee Journey (M1 - M4) */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/buy" element={<CheckoutPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/order/:orderId" element={<PaymentConfirmingPage />} />
      <Route path="/pass/:orderId" element={<PassPage />} />
      <Route path="/my-ticket" element={<MyTicketPage />} />
      <Route path="/cash" element={<CashTokenPage />} />
      <Route path="/organizers" element={<OrganizersPage />} />

      {/* Staff Operations (M5 - M8) */}
      <Route path="/staff" element={<StaffLoginPage />} />
      <Route path="/gate" element={<GateScannerPage />} />
      <Route path="/pos" element={<BoxOfficePOSPage />} />
      <Route path="/admin/*" element={<AdminDashboardPage />} />

      {/* Catch-all redirect to Landing */}
      <Route path="*" element={<LandingPage />} />
    </Routes>
    </Suspense>
  );
}
