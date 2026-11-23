import mongoose from 'mongoose';
import crypto from 'crypto';
import { PRESENCE, PASS_STATUS } from '../constants/index.js';

const passSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    ref: 'Order'
  },
  eventId: {
    type: String,
    default: 'comics-carnival',
    index: true
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
  badge: {
    type: String,
    required: true
  },
  tierId: {
    type: String,
    default: 'general',
    index: true
  },
  tierName: {
    type: String,
    default: 'General Comic Pass'
  },
  allowedZones: {
    type: [String],
    default: ['MAIN_HALL']
  },
  addOns: [
    {
      addOnId: { type: String },
      name: { type: String },
      variant: { type: String },
      category: { type: String, default: 'MERCH' },
      claimed: { type: Boolean, default: false },
      claimedAt: { type: Date }
    }
  ],
  isGroupPass: {
    type: Boolean,
    default: false
  },
  groupIndex: {
    type: Number,
    default: 0
  },
  // Helpdesk Reissue Tracking
  reissuedFromPassId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pass',
    default: null
  },
  reissueReason: {
    type: String,
    default: null
  },
  photoUrl: {
    type: String,
    default: null
  },
  validDays: {
    type: [Number],
    required: true,
    default: [1, 2, 3]
  },
  status: {
    type: String,
    enum: Object.values(PASS_STATUS),
    default: PASS_STATUS.ACTIVE,
    index: true
  },
  presence: {
    type: String,
    enum: Object.values(PRESENCE),
    default: PRESENCE.OUTSIDE,
    index: true
  },
  lastScan: {
    at: { type: Date },
    gateId: { type: String },
    deviceId: { type: String },
    direction: { type: String }
  },
  entriesByDay: {
    type: Map,
    of: Number,
    default: { "1": 0, "2": 0, "3": 0 }
  },
  firstEntryDays: {
    type: [Number],
    default: []
  },
  qrNonce: {
    type: String,
    default: () => crypto.randomBytes(16).toString('hex')
  }
}, {
  timestamps: true
});

passSchema.index({ status: 1, phone: 1 });

export const Pass = mongoose.model('Pass', passSchema);

