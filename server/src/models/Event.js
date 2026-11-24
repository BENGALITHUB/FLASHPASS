import mongoose from 'mongoose';
import { DEFAULT_ADMIN_SETTINGS } from '../constants/index.js';

const eventSchema = new mongoose.Schema({
  eventId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  venue: {
    type: String,
    required: true,
    trim: true
  },
  announcementText: {
    type: String,
    default: DEFAULT_ADMIN_SETTINGS.announcementText
  },
  basePricePaise: {
    type: Number,
    required: true,
    default: DEFAULT_ADMIN_SETTINGS.basePricePaise
  },
  platformFeePaise: {
    type: Number,
    required: true,
    default: DEFAULT_ADMIN_SETTINGS.platformFeePaise
  },
  capacityLimit: {
    type: Number,
    default: DEFAULT_ADMIN_SETTINGS.capacityLimit
  },
  allowReentry: {
    type: Boolean,
    default: DEFAULT_ADMIN_SETTINGS.allowReentry
  },
  maxReentriesPerDay: {
    type: Number,
    default: DEFAULT_ADMIN_SETTINGS.maxReentriesPerDay
  },
  reentryMode: {
    type: String,
    enum: ['IN_OUT', 'WRISTBAND'],
    default: DEFAULT_ADMIN_SETTINGS.reentryMode
  },
  // Bumped inside every payout transaction so two payouts for the same event
  // can't both pass the balance check at the same moment
  settlementSeq: {
    type: Number,
    default: 0
  },
  emergencyLockdown: {
    type: Boolean,
    default: false
  },
  onlineSalesEnabled: {
    type: Boolean,
    default: true
  },
  cashSalesEnabled: {
    type: Boolean,
    default: true
  },
  gateOpenTime: {
    type: String,
    default: '00:00'
  },
  gateCloseTime: {
    type: String,
    default: '23:59'
  },
  // 1. Multi-Tier Ticket Categories & Perks
  ticketTiers: [
    {
      tierId: { type: String, required: true },
      name: { type: String, required: true },
      pricePaise: { type: Number, required: true },
      platformFeePaise: { type: Number, default: 200 },
      capacity: { type: Number, default: 1000 },
      soldCount: { type: Number, default: 0 },
      perks: [{ type: String }],
      color: { type: String, default: 'yellow' },
      allowedZones: [{ type: String }],
      badge: { type: String, default: 'GENERAL' },
      featured: { type: Boolean, default: false }, // shows a "POPULAR" label on checkout
      active: { type: Boolean, default: true }
    }
  ],
  // 2. Coupon & Promo Code Engine
  coupons: [
    {
      code: { type: String, required: true, uppercase: true, trim: true },
      discountType: { type: String, enum: ['PERCENT', 'FLAT'], default: 'PERCENT' },
      discountValue: { type: Number, required: true },
      maxUses: { type: Number, default: 100 },
      usedCount: { type: Number, default: 0 },
      minOrderAmountPaise: { type: Number, default: 0 },
      active: { type: Boolean, default: true },
      expiryDate: { type: Date }
    }
  ],
  // 3. Event Add-ons & Merchandise Pre-order
  addOns: [
    {
      addOnId: { type: String, required: true },
      name: { type: String, required: true },
      pricePaise: { type: Number, required: true },
      category: { type: String, enum: ['MERCH', 'FOOD', 'PARKING', 'VIP_PERK'], default: 'MERCH' },
      description: { type: String },
      icon: { type: String, default: 'Shirt' },
      inventory: { type: Number, default: 500 },
      soldCount: { type: Number, default: 0 },
      variants: [{ type: String }],
      active: { type: Boolean, default: true }
    }
  ],
  // 4. Influencer / Ambassador Affiliate Links
  affiliates: [
    {
      code: { type: String, required: true, lowercase: true, trim: true },
      ambassadorName: { type: String, required: true },
      commissionPct: { type: Number, default: 10 },
      totalSalesPaise: { type: Number, default: 0 },
      totalCommissionPaise: { type: Number, default: 0 },
      ordersCount: { type: Number, default: 0 },
      active: { type: Boolean, default: true }
    }
  ],
  // 5. Multi-Zone / Hall Access Control
  zones: [
    {
      zoneId: { type: String, required: true },
      name: { type: String, required: true },
      gateIds: [{ type: String }],
      requiredTiers: [{ type: String }]
    }
  ],
  // 6. Emergency Evacuation Broadcast System
  emergencyEvacuation: {
    active: { type: Boolean, default: false },
    message: { type: String, default: 'EMERGENCY EVACUATION ACTIVE - ALL GATES UNLOCKED FOR EXIT' },
    triggeredAt: { type: Date },
    triggeredBy: { type: String }
  },
  // 7. Live Announcement Push to Digital Passes
  liveAnnouncements: [
    {
      id: { type: String },
      text: { type: String, required: true },
      type: { type: String, enum: ['INFO', 'ALERT', 'STAGE', 'OFFER'], default: 'INFO' },
      createdAt: { type: Date, default: Date.now },
      active: { type: Boolean, default: true }
    }
  ],
  eventDays: [
    {
      day: { type: Number, required: true },
      date: { type: String, required: true },
      label: { type: String }
    }
  ],
  organizer: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String, trim: true },
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true }
  },
  // 8. Multi-Tenant Payment Gateway Configuration (Top 5 Gateways)
  paymentGateway: {
    enabled: { type: Boolean, default: true },
    provider: {
      type: String,
      enum: ['PAYU', 'RAZORPAY', 'CASHFREE', 'PHONEPE', 'STRIPE'],
      default: 'PAYU'
    },
    usePlatformDefault: { type: Boolean, default: true },
    env: { type: String, enum: ['TEST', 'PRODUCTION'], default: 'TEST' },

    // 1. PayU credentials
    merchantKey: { type: String, trim: true, default: '' },
    merchantSalt: { type: String, trim: true, default: '' },

    // 2. Razorpay credentials
    razorpayKeyId: { type: String, trim: true, default: '' },
    razorpayKeySecret: { type: String, trim: true, default: '' },

    // 3. Cashfree credentials
    cashfreeAppId: { type: String, trim: true, default: '' },
    cashfreeSecretKey: { type: String, trim: true, default: '' },

    // 4. PhonePe credentials
    phonepeMerchantId: { type: String, trim: true, default: '' },
    phonepeSaltKey: { type: String, trim: true, default: '' },
    phonepeSaltIndex: { type: String, trim: true, default: '1' },

    // 5. Stripe credentials
    stripePublishableKey: { type: String, trim: true, default: '' },
    stripeSecretKey: { type: String, trim: true, default: '' }
  },
  status: {
    type: String,
    // ARCHIVED: hidden from the public and closed to sales, records kept.
    enum: ['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'],
    default: 'ACTIVE',
    index: true
  }
}, {
  timestamps: true
});

// Gateway secrets sign payment callbacks: they must never reach a browser,
// whichever route sends an event document out as JSON.
const GATEWAY_SECRET_FIELDS = ['merchantSalt', 'razorpayKeySecret', 'cashfreeSecretKey', 'phonepeSaltKey', 'stripeSecretKey'];
eventSchema.set('toJSON', {
  transform(doc, ret) {
    if (ret.paymentGateway) {
      for (const f of GATEWAY_SECRET_FIELDS) delete ret.paymentGateway[f];
    }
    return ret;
  }
});

export const Event = mongoose.model('Event', eventSchema);

