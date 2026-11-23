# 3-Day Comics Carnival — Ticketing & Gate Control System (MERN Stack)

A high-throughput, fraud-proof ticketing and gate ingress platform built for the **3-Day Comics Carnival**, Kolkata. Designed following **SRS v2.0** specifications with dynamic admin pricing, zero messaging delivery costs, sub-500ms gate scanning with atomic anti-passback, and real-time financial virtual ledgers.

---

## 🎨 Visual Identity & Comic-Con Theme
* **Dark Base:** `#0B0B14` ("Night-at-the-con")
* **Accents:** Comic Yellow (`#FFD60A`), Hot Magenta (`#FF2E88`), Cyan (`#22D3EE`), Orange (`#FB923C`)
* **Styling:** Thick 2px borders, 4px 3D hard drop-shadows (`box-shadow: 4px 4px 0 #000`), halftone dot textures
* **Typography:** Google Bangers (Display), Inter (Body), JetBrains Mono (Numbers)

---

## 🚀 Key Modules Built

1. **Module M1: Online Purchase & Dynamic Pricing (`/`, `/buy`)**
   * Dynamic offer badge (3-Day All Access, 2-Day Pass, 1-Day Final Pass) computed live at payment time.
   * Zero hardcoding: base price and platform fee are read from `AdminSettings` and snapshotted onto orders in integer paise.
   * Ultra-lean 3-field form (Name, Mobile, optional Email).
2. **Module M2: Zero-Cost Digital Pass & PWA (`/pass/:orderId`)**
   * Large scannable QR on pure white background (HMAC-SHA256 signed token).
   * 1-Click Client-side **Save Image** (1080×1920 PNG), **Print PDF** (A6 card), and **Web Share to WhatsApp**.
   * LocalStorage and Service Worker offline caching.
3. **Module M3: "My Ticket" Self-Recovery (`/my-ticket`)**
   * Mobile number + Order ID recovery with rate-limiting and generic enumeration-safe errors.
4. **Module M4 & M5: Venue Cash Token & Box Office POS (`/cash`, `/pos`)**
   * Self-service token (`C-142`) with 30-min countdown timer and screen wake lock.
   * Cashier keyboard-first desktop counter (`Enter`, `Spacebar`, `F2`, `F9`, `Ctrl+Z` 30s undo).
   * Instant live transformation of attendee phone screen into Pass upon cashier confirmation via WebSocket.
5. **Module M6: Gate Scanner & Anti-Passback Engine (`/gate`)**
   * Mobile rear camera scanner with `html5-qrcode`.
   * Separate ENTRY (Cyan) and EXIT (Orange) modes.
   * Sub-150ms atomic conditional update: blocks screenshot sharing immediately with Scarlet Red screen, loud 220Hz buzzer, and 3x vibration.
6. **Module M7 & M8: Super Admin Control Center (`/admin`)**
   * Live financial ledger cards (Gross, Organizer Net Share, Platform Fee).
   * Real-time crowd safety gauge with 80% amber / 95% red capacity thresholds.
   * Global pass search drawer with full scan history, force-reset to OUTSIDE, and PIN-protected dynamic price updates.
   * 1-Click CSV exports for accountant audit.

---

## 🔑 Demo Staff Logins (Pre-seeded in Database)

> **Local testing only.** These PINs are public. Before the event, change every one in **Admin → Staff → Change PIN**. The admin dashboard shows a red warning while any demo PIN is still in use.

| Role | Username | 6-Digit PIN | Redirect URL |
|---|---|---|---|
| **Super Admin** | `admin` | `123456` | `/admin` |
| **Box Office Cashier** | `cashier1` | `111111` | `/pos` |
| **Gate Volunteer** | `gate1` | `222222` | `/gate` |
| **Event Organizer** | `carnival_admin` | `333333` | `/admin` |

---

## 🧪 Tests

```bash
npm test          # all server tests (uses a throwaway in-memory MongoDB, never your real one)
npm run loadtest  # gate scan load test: 60 scans/s for 30 s, checks p95 ≤ 500 ms and no double entries
```

Run the load test again in the week before the event (SRS runbook, T-7).

---

## 🚀 Running Live

1. **Secret** in `server/.env`: generate `QR_HMAC_SECRET` (`node server/scripts/rotate-secrets.mjs` does it safely). In production the server will not start with a missing, short or public secret.
   Rotating it after passes are sold keeps old QRs working (`QR_KEY_VERSION_PREVIOUS` / `QR_HMAC_SECRET_PREVIOUS`).
2. **HTTPS is required.** Phones only open the gate camera and keep the offline pass on HTTPS, and the staff session cookie is marked `Secure` on HTTPS (it still works on plain http, but use HTTPS live).
3. Behind nginx / cPanel / a load balancer, set `TRUST_PROXY=1` so rate limits see real visitor IPs.
4. **Never** set `ALLOW_MOCK_PAYMENTS` on the live server.
5. Build and start with pm2 (restarts on crash, survives reboots):
   ```bash
   npm i -g pm2
   npm run install:all
   npm run build:client
   npm run prod:start
   pm2 save && pm2 startup     # start again after a reboot (Linux); on Windows use pm2-installer
   ```
   Keep one instance: rate limits, the PayU payment check and live gate updates run inside the process.
6. Change every demo PIN in **Admin → Staff**.

---

## 🛠️ How to Run Locally

### 1. Start Both Backend & Frontend Concurrently:
```bash
npm run dev
```

### 2. Or Start Separately:
* **Backend API (Port 5000):**
  ```bash
  cd server
  npm run dev
  ```
* **Frontend Client (Port 3000):**
  ```bash
  cd client
  npm run dev
  ```

---

## 🌐 URLs to Explore

* **Landing Page:** `http://localhost:3000/`
* **Checkout:** `http://localhost:3000/buy`
* **My Ticket Recovery:** `http://localhost:3000/my-ticket`
* **Venue Cash Token:** `http://localhost:3000/cash`
* **Staff Login Portal:** `http://localhost:3000/staff`
* **Box Office POS Desk:** `http://localhost:3000/pos`
* **Gate Scanner App:** `http://localhost:3000/gate`
* **Super Admin Dashboard:** `http://localhost:3000/admin`


---

## 🔐 Staff Sign-in

- Username + 6-digit PIN. 5 wrong PINs lock the account for 15 minutes; one network can try at most 60 logins per 15 minutes.
- The session lives on the server and in an **HttpOnly, SameSite=Strict cookie** (page scripts cannot read it).
- Admins / organizers: 12 h, logged out after 2 h idle. Cashier / gate: 16 h, 4 h idle.
- Logging out, changing a PIN or switching an account off **ends its sessions on every device at once**, including live gate/admin screens.
- **Admin → Staff → Devices** shows where each person is logged in, with *Log out* per device and *Log out everywhere* (lost phone).
- Live updates: revenue and sponsor inquiries go to admins only; gate counts to gate staff and admins.
- Demo logins on the sign-in page appear only on the local dev server, never in a production build.
