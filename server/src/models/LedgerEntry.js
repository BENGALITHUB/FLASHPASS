import mongoose from 'mongoose';
import { LEDGER_TYPES, ORDER_CHANNELS } from '../constants/index.js';

const ledgerEntrySchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    index: true,
    ref: 'Order'
  },
  eventId: {
    type: String,
    default: 'comics-carnival',
    index: true
  },
  type: {
    type: String,
    enum: Object.values(LEDGER_TYPES),
    default: LEDGER_TYPES.SALE,
    required: true
  },
  channel: {
    type: String,
    enum: Object.values(ORDER_CHANNELS),
    required: true
  },
  grossPaise: {
    type: Number,
    required: true
  },
  organizerPaise: {
    type: Number,
    required: true
  },
  platformPaise: {
    type: Number,
    required: true
  },
  byUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  at: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

export const LedgerEntry = mongoose.model('LedgerEntry', ledgerEntrySchema);

