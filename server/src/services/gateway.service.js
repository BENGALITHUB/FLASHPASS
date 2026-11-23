import crypto from 'crypto';
import { generatePayUParams, getPayUConfig } from './payu.service.js';

export const SUPPORTED_GATEWAYS = {
  PAYU: {
    id: 'PAYU',
    name: 'PayU Hosted Checkout',
    badge: 'PayU',
    description: 'UPI, Cards, NetBanking, Wallets (PayU India Hosted)',
    defaultEnv: 'TEST',
    available: true
  },
  RAZORPAY: {
    id: 'RAZORPAY',
    name: 'Razorpay',
    badge: 'Razorpay',
    description: "India's #1 PG — Instant UPI Intent, QR, Cards & NetBanking",
    defaultEnv: 'TEST',
    available: false
  },
  CASHFREE: {
    id: 'CASHFREE',
    name: 'Cashfree Payments',
    badge: 'Cashfree',
    description: 'Instant UPI, Drop Checkout, Cards, Lowest Settlement TDR',
    defaultEnv: 'TEST',
    available: false
  },
  PHONEPE: {
    id: 'PHONEPE',
    name: 'PhonePe Payment Gateway',
    badge: 'PhonePe',
    description: 'Direct PhonePe UPI Intent, Dynamic QR, Web Checkout',
    defaultEnv: 'TEST',
    available: false
  },
  STRIPE: {
    id: 'STRIPE',
    name: 'Stripe',
    badge: 'Stripe',
    description: 'Global & Domestic Credit/Debit Cards, Apple Pay, Google Pay',
    defaultEnv: 'TEST',
    available: false
  }
};

/**
 * Whether buyers can actually pay through this provider. Only PayU has a
 * complete flow (hosted checkout, signed callback, server-side reconciliation).
 * The others are listed for later but must not take real orders yet: Razorpay
 * needs a server-created order and a webhook, and PhonePe, Cashfree and Stripe
 * have no checkout or verification at all.
 */
export function isGatewayAvailable(provider) {
  return Boolean(SUPPORTED_GATEWAYS[String(provider || 'PAYU').toUpperCase()]?.available);
}

/**
 * Resolve effective credentials for the event's selected gateway
 */
export function getGatewayConfig(event = null) {
  const gw = event?.paymentGateway || {};
  const provider = (gw.provider || 'PAYU').toUpperCase();
  const usePlatformDefault = gw.usePlatformDefault !== false;
  const env = (gw.env || 'TEST').toUpperCase();

  switch (provider) {
    case 'RAZORPAY': {
      const keyId = (!usePlatformDefault && gw.razorpayKeyId)
        ? gw.razorpayKeyId
        : (process.env.RAZORPAY_KEY_ID || '');
      const keySecret = (!usePlatformDefault && gw.razorpayKeySecret)
        ? gw.razorpayKeySecret
        : (process.env.RAZORPAY_KEY_SECRET || '');
      return {
        provider: 'RAZORPAY',
        usePlatformDefault,
        env,
        keyId,
        keySecret
      };
    }

    case 'CASHFREE': {
      const appId = (!usePlatformDefault && gw.cashfreeAppId)
        ? gw.cashfreeAppId
        : (process.env.CASHFREE_APP_ID || '');
      const secretKey = (!usePlatformDefault && gw.cashfreeSecretKey)
        ? gw.cashfreeSecretKey
        : (process.env.CASHFREE_SECRET_KEY || '');
      return {
        provider: 'CASHFREE',
        usePlatformDefault,
        env,
        appId,
        secretKey
      };
    }

    case 'PHONEPE': {
      const merchantId = (!usePlatformDefault && gw.phonepeMerchantId)
        ? gw.phonepeMerchantId
        : (process.env.PHONEPE_MERCHANT_ID || '');
      const saltKey = (!usePlatformDefault && gw.phonepeSaltKey)
        ? gw.phonepeSaltKey
        : (process.env.PHONEPE_SALT_KEY || '');
      const saltIndex = (!usePlatformDefault && gw.phonepeSaltIndex)
        ? gw.phonepeSaltIndex
        : (process.env.PHONEPE_SALT_INDEX || '1');
      return {
        provider: 'PHONEPE',
        usePlatformDefault,
        env,
        merchantId,
        saltKey,
        saltIndex
      };
    }

    case 'STRIPE': {
      const publishableKey = (!usePlatformDefault && gw.stripePublishableKey)
        ? gw.stripePublishableKey
        : (process.env.STRIPE_PUBLISHABLE_KEY || '');
      const secretKey = (!usePlatformDefault && gw.stripeSecretKey)
        ? gw.stripeSecretKey
        : (process.env.STRIPE_SECRET_KEY || '');
      return {
        provider: 'STRIPE',
        usePlatformDefault,
        env,
        publishableKey,
        secretKey
      };
    }

    case 'PAYU':
    default: {
      const payu = getPayUConfig(event);
      return {
        provider: 'PAYU',
        usePlatformDefault,
        env: payu.env,
        configured: payu.configured,
        merchantKey: payu.key,
        merchantSalt: payu.salt
      };
    }
  }
}

/**
 * Generate checkout parameters / session for the selected gateway
 */
export function generateGatewaySession({ order, event, req }) {
  const config = getGatewayConfig(event);
  const provider = config.provider;
  const serverUrl = process.env.SERVER_URL || `${req?.protocol || 'http'}://${req?.get ? req.get('host') : 'localhost:5000'}`;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  if (provider === 'PAYU') {
    const payu = generatePayUParams({
      orderId: order.orderId,
      amountPaise: order.amountPaise,
      productInfo: `${order.tierName || 'Comic Pass'} (${order.attendees?.length || 1} pass)`,
      firstName: order.holderName,
      email: order.email,
      phone: order.phone,
      udf1: event?.eventId || order.eventId || 'comics-carnival',
      udf2: order.tierId || 'general',
      event
    });
    return {
      provider: 'PAYU',
      name: 'PayU Hosted Checkout',
      env: config.env,
      actionUrl: payu.actionUrl,
      params: payu.params,
      payu
    };
  }

  if (provider === 'RAZORPAY') {
    return {
      provider: 'RAZORPAY',
      name: 'Razorpay Checkout',
      env: config.env,
      keyId: config.keyId,
      amountPaise: order.amountPaise,
      currency: 'INR',
      orderId: order.orderId,
      eventName: event?.name || 'FlashPass Ingress',
      description: `${order.tierName || 'Comic Pass'} #${order.orderId}`,
      prefill: {
        name: order.holderName,
        email: order.email || 'ticket@flashpass.live',
        contact: order.phone
      },
      notes: {
        orderId: order.orderId,
        eventId: order.eventId || 'comics-carnival'
      }
    };
  }

  if (provider === 'CASHFREE') {
    return {
      provider: 'CASHFREE',
      name: 'Cashfree Payments',
      env: config.env,
      appId: config.appId,
      orderId: order.orderId,
      amountRupees: (order.amountPaise / 100).toFixed(2),
      currency: 'INR',
      customer: {
        name: order.holderName,
        email: order.email || 'ticket@flashpass.live',
        phone: order.phone
      },
      returnUrl: `${serverUrl}/api/v1/orders/cashfree/callback?orderId=${order.orderId}`
    };
  }

  if (provider === 'PHONEPE') {
    return {
      provider: 'PHONEPE',
      name: 'PhonePe Payment Gateway',
      env: config.env,
      merchantId: config.merchantId,
      orderId: order.orderId,
      amountPaise: order.amountPaise,
      amountRupees: (order.amountPaise / 100).toFixed(2),
      phone: order.phone,
      actionUrl: config.env === 'PRODUCTION'
        ? 'https://api.phonepe.com/apis/hermes/pg/v1/pay'
        : 'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay',
      callbackUrl: `${serverUrl}/api/v1/orders/phonepe/callback?orderId=${order.orderId}`,
      redirectUrl: `${clientUrl}/order/${order.orderId}?phonepe=1`
    };
  }

  if (provider === 'STRIPE') {
    return {
      provider: 'STRIPE',
      name: 'Stripe Checkout',
      env: config.env,
      publishableKey: config.publishableKey,
      orderId: order.orderId,
      amountPaise: order.amountPaise,
      amountRupees: (order.amountPaise / 100).toFixed(2),
      currency: 'inr',
      successUrl: `${clientUrl}/order/${order.orderId}?stripe=success`,
      cancelUrl: `${clientUrl}/order/${order.orderId}?stripe=cancel`
    };
  }

  // Fallback
  return {
    provider: 'PAYU',
    name: 'PayU Hosted Checkout',
    env: 'TEST'
  };
}

/**
 * Simulated payments (no money moves) are for local development only.
 * They need an explicit opt-in AND a non-production environment, so a
 * forgotten flag on a live server still cannot hand out free passes.
 */
export function isMockPaymentAllowed() {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_MOCK_PAYMENTS === 'true';
}

/**
 * Verify Razorpay payment signature
 */
export function verifyRazorpaySignature({ orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, event }) {
  const config = getGatewayConfig(event);
  if (!config.keySecret) {
    throw new Error('Razorpay Key Secret is not configured');
  }

  // Standard Razorpay verification: HMAC-SHA256 of "razorpay_order_id|razorpay_payment_id"
  const payload = `${razorpayOrderId || orderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', config.keySecret)
    .update(payload)
    .digest('hex');

  const matches = expectedSignature.toLowerCase() === String(razorpaySignature).trim().toLowerCase();
  return {
    valid: matches,
    orderId,
    paymentId: razorpayPaymentId
  };
}

/**
 * Verify PhonePe callback / checksum
 */
export function verifyPhonePeChecksum({ base64Payload, xVerify, event }) {
  const config = getGatewayConfig(event);
  if (!config.saltKey) {
    throw new Error('PhonePe Salt Key is not configured');
  }

  // PhonePe formula: sha256(base64Payload + saltKey) + "###" + saltIndex
  const calculatedHash = crypto
    .createHash('sha256')
    .update(base64Payload + config.saltKey)
    .digest('hex');

  const expectedHeader = `${calculatedHash}###${config.saltIndex || '1'}`;
  return expectedHeader.toLowerCase() === String(xVerify).trim().toLowerCase();
}

// Fields that let someone sign payment callbacks. They are written by admins
// but never sent back to any browser.
const GATEWAY_SECRET_FIELDS = ['merchantSalt', 'razorpayKeySecret', 'cashfreeSecretKey', 'phonepeSaltKey', 'stripeSecretKey'];
const GATEWAY_PUBLIC_FIELDS = ['merchantKey', 'razorpayKeyId', 'cashfreeAppId', 'phonepeMerchantId', 'stripePublishableKey'];

/**
 * The event's gateway settings as the admin panel may see them: key ids,
 * whether each secret is saved (never the secret itself), and whether buyers
 * can pay right now.
 */
export function gatewaySettingsForAdmin(event = null) {
  const pg = event?.paymentGateway || {};
  const provider = String(pg.provider || 'PAYU').toUpperCase();
  const out = {
    enabled: pg.enabled !== false,
    provider,
    usePlatformDefault: pg.usePlatformDefault !== false,
    env: String(pg.env || 'TEST').toUpperCase(),
    phonepeSaltIndex: pg.phonepeSaltIndex || '1',
    savedSecrets: {}
  };
  for (const f of GATEWAY_PUBLIC_FIELDS) out[f] = pg[f] || '';
  for (const f of GATEWAY_SECRET_FIELDS) {
    out[f] = '';
    out.savedSecrets[f] = Boolean(pg[f]);
  }
  out.providerAvailable = isGatewayAvailable(provider);
  out.ready = out.enabled && out.providerAvailable && (provider !== 'PAYU' || getPayUConfig(event).configured);
  out.platformPayUEnv = String(process.env.PAYU_ENV || 'TEST').toUpperCase();
  return out;
}

/**
 * Apply an admin's gateway form to the saved settings. A blank secret keeps
 * the saved one (the form never receives it). Returns { value } or { error }.
 */
export function mergeGatewaySettings(incoming = {}, current = {}) {
  const provider = String(incoming.provider || current.provider || 'PAYU').toUpperCase();
  if (!SUPPORTED_GATEWAYS[provider]) {
    return { error: `Unknown payment gateway "${provider}"` };
  }
  const currentProvider = String(current.provider || 'PAYU').toUpperCase();
  if (provider !== currentProvider && !isGatewayAvailable(provider) && !isMockPaymentAllowed()) {
    return { error: `${SUPPORTED_GATEWAYS[provider].name} is not available yet. Use PayU.` };
  }
  const env = String(incoming.env || current.env || 'TEST').toUpperCase();
  const value = {
    enabled: incoming.enabled !== undefined ? incoming.enabled !== false : current.enabled !== false,
    provider,
    usePlatformDefault: incoming.usePlatformDefault !== undefined ? incoming.usePlatformDefault !== false : current.usePlatformDefault !== false,
    env: env === 'PRODUCTION' ? 'PRODUCTION' : 'TEST',
    phonepeSaltIndex: incoming.phonepeSaltIndex !== undefined ? String(incoming.phonepeSaltIndex).trim() : (current.phonepeSaltIndex || '1')
  };
  for (const f of GATEWAY_PUBLIC_FIELDS) {
    value[f] = incoming[f] !== undefined ? String(incoming[f]).trim() : (current[f] || '');
  }
  for (const f of GATEWAY_SECRET_FIELDS) {
    const v = typeof incoming[f] === 'string' ? incoming[f].trim() : '';
    value[f] = v || current[f] || '';
  }
  return { value };
}
