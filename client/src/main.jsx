import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'
import { initAnalytics } from './utils/analytics'

initAnalytics()

// Offline pass support (public/sw.js) + automatic cache-clear & reload on new deployment.
if (import.meta.env.PROD) {
  const clearAllCachesAndReload = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => {})));
      }
    } catch {}
    window.location.reload();
  };

  let checkingVersion = false;
  const checkForUpdates = async () => {
    if (checkingVersion || !navigator.onLine) return;
    checkingVersion = true;
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const { buildId } = await res.json();
      if (!buildId) return;
      const prev = localStorage.getItem('fp_build_id');
      if (prev && prev !== buildId) {
        localStorage.setItem('fp_build_id', buildId);
        await clearAllCachesAndReload();
        return;
      }
      if (!prev) localStorage.setItem('fp_build_id', buildId);
    } catch {}
    finally {
      checkingVersion = false;
    }
  };

  window.addEventListener('load', () => {
    checkForUpdates();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          setInterval(() => reg.update().catch(() => {}), 60_000);
        })
        .catch(() => {});
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdates();
  });
  setInterval(checkForUpdates, 120_000);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

