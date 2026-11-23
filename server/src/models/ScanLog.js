import mongoose from 'mongoose';
import { GATE_MODES, SCAN_RESULTS } from '../constants/index.js';

const scanLogSchema = new mongoose.Schema({
  passId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pass'
  },
  orderId: {
    type: String
  },
  eventId: {
    type: String,
    default: 'comics-carnival',
    index: true
  },
  eventDay: {
    type: Number,
    required: true
  },
  direction: {
    type: String,
    enum: Object.values(GATE_MODES),
    required: true
  },
  result: {
    type: String,
    enum: Object.values(SCAN_RESULTS),
    required: true,
    index: true
  },
  isFirstEntryOfDay: {
    type: Boolean,
    default: false
  },
  gateId: {
    type: String,
    required: true
  },
  deviceId: {
    type: String
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  latencyMs: {
    type: Number,
    default: 0
  },
  at: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

scanLogSchema.index({ eventDay: 1, result: 1, at: 1 });
scanLogSchema.index({ passId: 1, at: -1 });

export const ScanLog = mongoose.model('ScanLog', scanLogSchema);

