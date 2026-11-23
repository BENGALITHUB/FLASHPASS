import mongoose from 'mongoose';

export const PAYOUT_METHODS = ['BANK_TRANSFER', 'UPI', 'CASH', 'CHEQUE', 'OTHER'];

/**
 * A payout is money the platform has sent to an event organizer.
 * The system does not move money: an admin sends it from the bank/UPI app and
 * records it here so the organizer's balance stays correct.
 *
 * Records are never edited or deleted. A mistake is corrected by voiding the
 * payout (with a reason), which keeps the full history.
 */
const payoutSchema = new mongoose.Schema({
  eventId: { type: String, required: true, index: true },
  amountPaise: { type: Number, required: true, min: 1 },
  paidAt: { type: Date, required: true },
  method: { type: String, enum: PAYOUT_METHODS, required: true },
  // Bank UTR / UPI transaction ID / cheque number
  reference: { type: String, trim: true, default: '' },
  note: { type: String, trim: true, default: '' },
  recordedBy: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String }
  },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'SettlementRequest', default: null },

  voided: { type: Boolean, default: false, index: true },
  voidedAt: { type: Date },
  voidReason: { type: String, trim: true },
  voidedBy: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String }
  }
}, {
  timestamps: true
});

// The same bank reference can't be recorded twice for one event (stops double entry)
payoutSchema.index(
  { eventId: 1, reference: 1 },
  { name: 'unique_reference_per_event', unique: true, partialFilterExpression: { voided: false, reference: { $gt: '' } } }
);

export const Payout = mongoose.model('Payout', payoutSchema);
