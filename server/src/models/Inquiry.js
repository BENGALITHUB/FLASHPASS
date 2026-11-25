import mongoose from 'mongoose';

// SPONSOR/STALL: event partners. GROUP: bulk/college booking. AMBASSADOR: referral-program application.
// ORGANIZER: B2B lead for hosting a new event on the platform (eventId 'platform').
export const INQUIRY_TYPES = ['SPONSOR', 'STALL', 'GROUP', 'AMBASSADOR', 'ORGANIZER'];

const inquirySchema = new mongoose.Schema({
  inquiryId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  eventId: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true
  },
  eventName: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    enum: INQUIRY_TYPES,
    required: true,
    index: true
  },
  brandName: {
    type: String,
    required: true,
    trim: true
  },
  contactPerson: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  category: {
    type: String,
    trim: true,
    default: 'GENERAL'
  },
  stallType: {
    type: String,
    trim: true
  },
  // Fixed list price of the chosen stall size, copied in when the inquiry is made
  stallLabel: { type: String, trim: true },
  stallPriceRupees: { type: Number, min: 0 },
  // What the vendor wants to say about the price (discount ask, offer, questions)
  priceNote: { type: String, trim: true, maxlength: 500 },
  sponsorshipTier: {
    type: String,
    trim: true
  },
  budget: {
    type: String,
    trim: true
  },
  message: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['NEW', 'CONTACTED', 'ACCEPTED', 'REJECTED'],
    default: 'NEW',
    index: true
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true
  },
  adminNotes: {
    type: String,
    default: ''
  },
  // Platform commission on a closed SPONSOR/STALL deal. Rate is snapshotted when the deal is accepted,
  // so later rate changes never rewrite what an organizer already owes.
  dealAmountPaise: { type: Number, min: 0 },
  commissionPct: { type: Number, min: 0, max: 100 },
  commissionPaise: { type: Number, min: 0, default: 0 },
  commissionStatus: {
    type: String,
    enum: ['NONE', 'DUE', 'PAID'],
    default: 'NONE',
    index: true
  },
  commissionPaidAt: { type: Date },
  commissionPaidBy: { type: String },
  handledBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    username: { type: String }
  }
}, {
  timestamps: true
});

export const Inquiry = mongoose.model('Inquiry', inquirySchema);

