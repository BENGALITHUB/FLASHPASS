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

export default function App() {
  const location = useLocation();

  // SPA page views for analytics (no-op unless VITE_GA_ID is configured)
  useEffect(() => {
    sessionStorage.removeItem('fp_chunk_reload');
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
