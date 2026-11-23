import mongoose from 'mongoose';
import { ORDER_STATUS, ORDER_CHANNELS } from '../constants/index.js';

const orderSchema = new mongoose.Schema({
  posRequestId: { type: String, unique: true, sparse: true },
  cashTenderedPaise: { type: Number },
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  eventId: {
    type: String,
    default: 'comics-carnival',
    index: true
  },
  channel: {
    type: String,
    enum: Object.values(ORDER_CHANNELS),
    required: true,
    default: ORDER_CHANNELS.ONLINE
  },
  holderName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    default: ''
  },
  // Ticket Tier
  tierId: {
    type: String,
    default: 'general'
  },
  tierName: {
    type: String,
    default: 'General Comic Pass'
  },
  // Group Booking: Multiple Attendee details (each with name, phone, photo)
  isGroupBooking: {
    type: Boolean,
    default: false
  },
  attendees: [
    {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      tierId: { type: String, default: 'general' },
      badge: { type: String, default: 'PASS' },
      passId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pass' }
    }
  ],
  // Coupon & Discounts
  couponCode: {
    type: String,
    default: null,
    uppercase: true,
    trim: true
  },
  discountPaise: {
    type: Number,
    default: 0
  },
  subtotalPaise: {
    type: Number,
    default: 0
  },
  // Add-ons & Merch
  addOns: [
    {
      addOnId: { type: String, required: true },
      name: { type: String, required: true },
      pricePaise: { type: Number, required: true },
      quantity: { type: Number, default: 1 },
      variant: { type: String },
      category: { type: String, default: 'MERCH' },
      claimed: { type: Boolean, default: false },
      claimedAt: { type: Date }
    }
  ],
  // Influencer / Affiliate Referral
  affiliateCode: {
    type: String,
    default: null,
    lowercase: true,
    trim: true
  },
  affiliateCommissionPaise: {
    type: Number,
    default: 0
  },
  amountPaise: {
    type: Number,
    required: true
  },
  organizerSharePaise: {
    type: Number,
    required: true
  },
  platformFeePaise: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: Object.values(ORDER_STATUS),
    default: ORDER_STATUS.CREATED,
    index: true
  },
  gateway: {
    provider: { type: String, default: 'MOCK_UPI' },
    gatewayOrderId: { type: String },
    paymentId: { type: String, sparse: true, index: true },
    method: { type: String, default: 'UPI' },
    // Server-side checks with the gateway for orders whose browser never returned
    lastCheckedAt: { type: Date },
    checkCount: { type: Number, default: 0 },
    lastCheckStatus: { type: String }
  },
  cashierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  paidAt: {
    type: Date
  }
}, {
  timestamps: true
});

// The selfie feature was removed; never send out photos stored on older orders
const dropPhotos = (_doc, ret) => {
  delete ret.photoUrl;
  (ret.attendees || []).forEach(a => { delete a.photoUrl; });
  return ret;
};
orderSchema.set('toJSON', { transform: dropPhotos });
orderSchema.set('toObject', { transform: dropPhotos });

export const Order = mongoose.model('Order', orderSchema);

