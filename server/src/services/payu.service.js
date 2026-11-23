import crypto from 'crypto';

/**
 * PayU Web Checkout Integration Service
 * Supporting dynamic amount calculation, SHA-512 request hashing,
 * and reverse response hash verification.
 */

// PayU's public sandbox credentials. Anyone can read them in PayU's docs, so
// anyone could sign a fake "success" callback with them. They are only ever
// used for local development, never when NODE_ENV=production.
const PAYU_PUBLIC_TEST_KEY = 'Se8qmO';
const PAYU_PUBLIC_TEST_SALT = '0R5yPuaFXfEicsHhpU3tLxc5QoIeciyW';

export class PaymentNotConfiguredError extends Error {
  constructor(message = 'Online payment is not set up yet. Please buy at the venue Cash Desk.') {
    super(message);
    this.code = 'PAYMENT_NOT_CONFIGURED';
  }
}

export const getPayUConfig = (event = null) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const gw = event?.paymentGateway;
  let key;
  let salt;
  let env;
  let source;

  // An organizer's own PayU account, if one is saved for this event
  if (gw && gw.usePlatformDefault === false && gw.merchantKey && gw.merchantSalt) {
    key = gw.merchantKey.trim();
    salt = gw.merchantSalt.trim();
    env = (gw.env || 'TEST').toUpperCase();
    source = 'EVENT';
  } else {
    // The platform's PayU account, from server/.env
    key = (process.env.PAYU_MERCHANT_KEY || '').trim();
    salt = (process.env.PAYU_MERCHANT_SALT || '').trim();
    env = (process.env.PAYU_ENV || 'TEST').toUpperCase();
    source = 'PLATFORM';
    if ((!key || !salt) && !isProduction) {
      key = PAYU_PUBLIC_TEST_KEY;
      salt = PAYU_PUBLIC_TEST_SALT;
      env = 'TEST';
      source = 'PUBLIC_TEST';
    }
  }

  const usesPublicSalt = salt === PAYU_PUBLIC_TEST_SALT;
  const configured = Boolean(key && salt) && !(isProduction && usesPublicSalt);

  const actionUrl = env === 'PRODUCTION'
    ? 'https://secure.payu.in/_payment'
    : 'https://test.payu.in/_payment';

  const serverUrl = process.env.SERVER_URL || 'http://localhost:5000';
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  return { key, salt, env, source, configured, actionUrl, serverUrl, clientUrl };
};

/**
 * Why the platform PayU account cannot take payments, or null when it can.
 * Used for the startup warning.
 */
export const platformPayUProblem = () => {
  const key = (process.env.PAYU_MERCHANT_KEY || '').trim();
  const salt = (process.env.PAYU_MERCHANT_SALT || '').trim();
  if (!key || !salt) return 'PAYU_MERCHANT_KEY / PAYU_MERCHANT_SALT are not set';
  if (salt === PAYU_PUBLIC_TEST_SALT) return 'PAYU_MERCHANT_SALT is PayU\'s public test salt';
  return null;
};

/**
 * Generate SHA-512 Hash & Form Parameters for PayU Hosted Checkout
 * Formula:
 * sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5|udf6|udf7|udf8|udf9|udf10|SALT)
 */
export const generatePayUParams = ({
  orderId,
  amountPaise,
  productInfo = 'Comics Carnival Pass',
  firstName,
  email = '',
  phone = '',
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = '',
  event = null
}) => {
  const config = getPayUConfig(event);
  if (!config.configured) {
    throw new PaymentNotConfiguredError();
  }
  const txnid = String(orderId).trim();
  const amount = (amountPaise / 100).toFixed(2);
  const cleanFirstName = (firstName || 'Attendee').trim().replace(/[^a-zA-Z0-9 ]/g, '').split(' ')[0] || 'Attendee';
  const cleanEmail = (email && email.includes('@')) ? email.trim() : 'guest@comicscarnival.com';
  const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10) || '9999999999';
  const cleanProductInfo = (productInfo || 'Ticket').trim().replace(/[^a-zA-Z0-9 -]/g, '');

  const surl = `${config.serverUrl}/api/v1/orders/payu/callback`;
  const furl = `${config.serverUrl}/api/v1/orders/payu/callback`;

  // Construct 17-element sequence
  const reqElements = [
    config.key,
    txnid,
    amount,
    cleanProductInfo,
    cleanFirstName,
    cleanEmail,
    udf1 || '',
    udf2 || '',
    udf3 || '',
    udf4 || '',
    udf5 || '',
    '', '', '', '', '', // udf6 - udf10
    config.salt
  ];

  const hashString = reqElements.join('|');
  const hash = crypto.createHash('sha512').update(hashString).digest('hex');

  return {
    actionUrl: config.actionUrl,
    env: config.env,
    params: {
      key: config.key,
      txnid,
      amount,
      productinfo: cleanProductInfo,
      firstname: cleanFirstName,
      email: cleanEmail,
      phone: cleanPhone,
      surl,
      furl,
      hash,
      udf1: udf1 || '',
      udf2: udf2 || '',
      udf3: udf3 || '',
      udf4: udf4 || '',
      udf5: udf5 || ''
    }
  };
};

/**
 * Verify PayU Incoming Response Hash (Reverse Hash)
 * Formula (without additionalCharges):
 * sha512(salt|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 * Formula (with additionalCharges):
 * sha512(additionalCharges|salt|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 */
export const verifyPayUResponseHash = (body, event = null) => {
  const {
    key,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    status,
    hash,
    additionalCharges,
    udf1 = '',
    udf2 = '',
    udf3 = '',
    udf4 = '',
    udf5 = ''
  } = body;

  const config = getPayUConfig(event);

  // Without a secret salt of our own the hash proves nothing, and the callback
  // must come from the merchant account this order was created on.
  if (!config.configured || (key && key !== config.key)) {
    return { isValid: false, calculatedHash: null, receivedHash: hash };
  }

  const resElements = [
    config.salt,
    status || '',
    '', '', '', '', '', // udf10 - udf6
    udf5 || '',
    udf4 || '',
    udf3 || '',
    udf2 || '',
    udf1 || '',
    email || '',
    firstname || '',
    productinfo || '',
    amount || '',
    txnid || '',
    config.key
  ];

  const hashString = additionalCharges
    ? [additionalCharges, ...resElements].join('|')
    : resElements.join('|');

  const calculatedHash = crypto.createHash('sha512').update(hashString).digest('hex');
  const isValid = calculatedHash.toLowerCase() === String(hash || '').toLowerCase();

  return {
    isValid,
    calculatedHash,
    receivedHash: hash
  };
};

/**
 * Ask PayU directly what happened to a transaction (server to server).
 * Used when the buyer's browser never came back to our callback, so an order
 * that was paid still gets its pass.
 *
 * PayU "verify_payment" API: hash = sha512(key|verify_payment|txnid|salt)
 * Returns { found, status: 'success'|'failure'|'pending'|..., mihpayid, amountPaise, mode }
 */
export const verifyPayUTransaction = async (txnid, event = null) => {
  const { key, salt, env, configured } = getPayUConfig(event);
  if (!configured) {
    throw new PaymentNotConfiguredError();
  }
  const command = 'verify_payment';
  const hash = crypto.createHash('sha512').update(`${key}|${command}|${txnid}|${salt}`).digest('hex');
  const url = env === 'PRODUCTION'
    ? 'https://info.payu.in/merchant/postservice.php?form=2'
    : 'https://test.payu.in/merchant/postservice.php?form=2';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ key, command, var1: txnid, hash }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) {
    throw new Error(`PayU verify HTTP ${res.status}`);
  }
  const json = await res.json();
  const details = json?.transaction_details?.[txnid];
  const status = String(details?.status || '').toLowerCase();
  const amount = Number.parseFloat(details?.amt ?? details?.transaction_amount);

  return {
    found: Boolean(details) && status !== 'not found',
    status,
    mihpayid: details?.mihpayid || null,
    amountPaise: Number.isFinite(amount) ? Math.round(amount * 100) : null,
    mode: details?.mode || null
  };
};
