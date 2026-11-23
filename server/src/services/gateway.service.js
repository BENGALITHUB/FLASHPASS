import crypto from 'crypto';
import { generatePayUParams, verifyPayUResponseHash } from './payu.service.js';

export const SUPPORTED_GATEWAYS = {
  PAYU: {
    id: 'PAYU',
    name: 'PayU Hosted Checkout',
    badge: 'PayU',
    description: 'UPI, Cards, NetBanking, Wallets (PayU India Hosted)',
    defaultEnv: 'TEST'
  },
  RAZORPAY: {
    id: 'RAZORPAY',
    name: 'Razorpay',
    badge: 'Razorpay',
    description: "India's #1 PG — Instant UPI Intent, QR, Cards & NetBanking",
    defaultEnv: 'TEST'
  },
  CASHFREE: {
    id: 'CASHFREE',
    name: 'Cashfree Payments',
    badge: 'Cashfree',
    description: 'Instant UPI, Drop Checkout, Cards, Lowest Settlement TDR',
    defaultEnv: 'TEST'
  },
  PHONEPE: {
    id: 'PHONEPE',
    name: 'PhonePe Payment Gateway',
    badge: 'PhonePe',
    description: 'Direct PhonePe UPI Intent, Dynamic QR, Web Checkout',
    defaultEnv: 'TEST'
  },
  STRIPE: {
    id: 'STRIPE',
    name: 'Stripe',
    badge: 'Stripe',
    description: 'Global & Domestic Credit/Debit Cards, Apple Pay, Google Pay',
    defaultEnv: 'TEST'
  }
};

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
        : (process.env.RAZORPAY_KEY_ID || 'rzp_test_comicscarnival');
      const keySecret = (!usePlatformDefault && gw.razorpayKeySecret)
        ? gw.razorpayKeySecret
        : (process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_comicscarnival');
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
        : (process.env.CASHFREE_APP_ID || 'TEST_CF_COMICS');
      const secretKey = (!usePlatformDefault && gw.cashfreeSecretKey)
        ? gw.cashfreeSecretKey
        : (process.env.CASHFREE_SECRET_KEY || 'TEST_CF_SECRET');
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
        : (process.env.PHONEPE_MERCHANT_ID || 'PGTESTPAYUAT');
      const saltKey = (!usePlatformDefault && gw.phonepeSaltKey)
        ? gw.phonepeSaltKey
        : (process.env.PHONEPE_SALT_KEY || '099eb0cd-02cf-4e2a-8aca-3e6c6aff0399');
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
        : (process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_comicscarnival');
      const secretKey = (!usePlatformDefault && gw.stripeSecretKey)
        ? gw.stripeSecretKey
        : (process.env.STRIPE_SECRET_KEY || 'sk_test_comicscarnival');
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
      const merchantKey = (!usePlatformDefault && gw.merchantKey)
        ? gw.merchantKey
        : (process.env.PAYU_MERCHANT_KEY || 'Se8qmO');
      const merchantSalt = (!usePlatformDefault && gw.merchantSalt)
        ? gw.merchantSalt
        : (process.env.PAYU_MERCHANT_SALT || '0R5yPuaFXfEicsHhpU3tLxc5QoIeciyW');
      return {
        provider: 'PAYU',
        usePlatformDefault,
        env,
        merchantKey,
        merchantSalt
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
