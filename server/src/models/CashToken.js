import mongoose from 'mongoose';
import { CASH_TOKEN_STATUS } from '../constants/index.js';

const cashTokenSchema = new mongoose.Schema({
  tokenNo: {
    type: Number,
    required: true
  },
  display: {
    type: String,
    required: true
  },
  checkCode: {
    type: String,
    required: true
  },
  // The event the guest is paying for; the counter only finds tokens for its own event.
  eventId: {
    type: String,
    trim: true,
    index: true
  },
  eventDay: {
    type: Number,
    required: true
  },
  holderName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: Object.values(CASH_TOKEN_STATUS),
    default: CASH_TOKEN_STATUS.OPEN,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  orderId: {
    type: String,
    ref: 'Order'
  }
}, {
  timestamps: true
});

cashTokenSchema.index({ eventDay: 1, tokenNo: 1 }, { unique: true });
cashTokenSchema.index({ phone: 1, status: 1 });

export const CashToken = mongoose.model('CashToken', cashTokenSchema);

