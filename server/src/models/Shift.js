import mongoose from 'mongoose';

/**
 * A cashier's shift at the box office (SRS FR-M5-07, BR-F-03).
 * Opens automatically when the cashier starts work. At close the cashier counts
 * the drawer; expected = opening float + cash sales during the shift.
 */
const shiftSchema = new mongoose.Schema({
  cashierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  cashierName: { type: String },
  openedAt: {
    type: Date,
    default: Date.now
  },
  closedAt: {
    type: Date
  },
  status: {
    type: String,
    enum: ['OPEN', 'CLOSED'],
    default: 'OPEN'
  },
  // Cash already in the drawer when the shift started (change float)
  openingFloatPaise: { type: Number, default: 0 },
  // Snapshot at close
  salesPaise: { type: Number, default: 0 },
  expectedPaise: {
    type: Number,
    default: 0
  },
  countedPaise: {
    type: Number,
    default: 0
  },
  differencePaise: { type: Number, default: 0 }, // counted − expected (negative = short)
  ticketCount: {
    type: Number,
    default: 0
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// One open shift per cashier
shiftSchema.index(
  { cashierId: 1 },
  { name: 'one_open_shift_per_cashier', unique: true, partialFilterExpression: { status: 'OPEN' } }
);

export const Shift = mongoose.model('Shift', shiftSchema);
