import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  actorName: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  target: {
    type: String,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  before: {
    type: mongoose.Schema.Types.Mixed
  },
  after: {
    type: mongoose.Schema.Types.Mixed
  },
  at: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);

