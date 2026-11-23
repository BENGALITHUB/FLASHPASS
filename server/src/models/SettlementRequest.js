import mongoose from 'mongoose';

export const REQUEST_STATUS = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED'
};

/**
 * An organizer asking the platform to pay out their balance.
 * Only one PENDING request per event at a time.
 */
const settlementRequestSchema = new mongoose.Schema({
  eventId: { type: String, required: true },
  amountPaise: { type: Number, required: true, min: 1 },
  // Where the organizer wants the money: UPI ID or bank account details
  payTo: { type: String, required: true, trim: true, maxlength: 300 },
  note: { type: String, trim: true, default: '', maxlength: 500 },
  requestedBy: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String }
  },
  status: {
    type: String,
    enum: Object.values(REQUEST_STATUS),
    default: REQUEST_STATUS.PENDING,
    index: true
  },
  resolvedAt: { type: Date },
  resolvedBy: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String }
  },
  resolutionNote: { type: String, trim: true, default: '' },
  payoutId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payout', default: null }
}, {
  timestamps: true
});

// At most one open request per event, enforced by the database
settlementRequestSchema.index(
  { eventId: 1 },
  { name: 'one_pending_request_per_event', unique: true, partialFilterExpression: { status: REQUEST_STATUS.PENDING } }
);
// Request history per event
settlementRequestSchema.index({ eventId: 1, createdAt: -1 });

export const SettlementRequest = mongoose.model('SettlementRequest', settlementRequestSchema);
