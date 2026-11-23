/*
 * Replace QR_HMAC_SECRET in server/.env with a new random value.
 *
 *   node server/scripts/rotate-secrets.mjs
 *
 * The new secret gets a new key version (CC1 -> CC2 ...). The old secret is kept
 * as QR_HMAC_SECRET_PREVIOUS, so every pass already sold still scans.
 * Nothing secret is printed. Restart the server afterwards.
 * (Staff logins use server-side sessions; there is no JWT secret any more.)
 */
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
let text = fs.readFileSync(envPath, 'utf8');
const get = (k) => (text.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1];
const set = (k, v) => {
  text = new RegExp(`^${k}=`, 'm').test(text)
    ? text.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`)
    : `${text.replace(/\s*$/, '')}\n${k}=${v}\n`;
};

const oldQr = get('QR_HMAC_SECRET');
const oldVersion = get('QR_KEY_VERSION') || 'CC1';
const nextVersion = `CC${(Number(oldVersion.replace(/\D/g, '')) || 1) + 1}`;

if (oldQr) {
  set('QR_KEY_VERSION_PREVIOUS', oldVersion);
  set('QR_HMAC_SECRET_PREVIOUS', oldQr);
}
set('QR_KEY_VERSION', nextVersion);
set('QR_HMAC_SECRET', crypto.randomBytes(48).toString('base64url'));

fs.writeFileSync(envPath, text);
console.log(`Done. QR key ${oldVersion} -> ${nextVersion}${oldQr ? ` (old ${oldVersion} QRs still accepted)` : ''}. Restart the server.`);
