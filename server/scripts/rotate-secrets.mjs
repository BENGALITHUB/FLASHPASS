/*
 * Replace JWT_SECRET and QR_HMAC_SECRET in server/.env with new random values.
 *
 *   node server/scripts/rotate-secrets.mjs
 *
 * - JWT_SECRET: new value. Effect: staff are logged out once and log in again.
 * - QR_HMAC_SECRET: new value under a new key version (CC1 -> CC2 ...). The old
 *   secret is kept as QR_HMAC_SECRET_PREVIOUS so every pass already sold still
 *   scans. Nothing is printed except key versions and lengths.
 * Restart the server afterwards.
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
const random = () => crypto.randomBytes(48).toString('base64url');

const oldQr = get('QR_HMAC_SECRET');
const oldVersion = get('QR_KEY_VERSION') || 'CC1';
const nextVersion = `CC${(Number(oldVersion.replace(/\D/g, '')) || 1) + 1}`;

set('JWT_SECRET', random());
if (oldQr) {
  set('QR_KEY_VERSION_PREVIOUS', oldVersion);
  set('QR_HMAC_SECRET_PREVIOUS', oldQr);
}
set('QR_KEY_VERSION', nextVersion);
set('QR_HMAC_SECRET', random());

fs.writeFileSync(envPath, text);
console.log(`Done. JWT_SECRET replaced. QR key ${oldVersion} -> ${nextVersion}${oldQr ? ` (old ${oldVersion} QRs still accepted)` : ''}. Restart the server.`);
