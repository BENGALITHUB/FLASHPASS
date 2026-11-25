import mongoose from 'mongoose';
import { DEFAULT_ADMIN_SETTINGS } from '../constants/index.js';

const adminSettingsSchema = new mongoose.Schema({
  eventName: {
    type: String,
    default: DEFAULT_ADMIN_SETTINGS.eventName
  },
  venue: {
    type: String,
    default: DEFAULT_ADMIN_SETTINGS.venue
  },
  announcementText: {
    type: String,
    default: DEFAULT_ADMIN_SETTINGS.announcementText
  },
  basePricePaise: {
    type: Number,
    required: true,
    default: DEFAULT_ADMIN_SETTINGS.basePricePaise
  },
  // Platform commission (%) on sponsor/stall deals that came in through website inquiries
  partnerCommissionPct: {
    type: Number,
    min: 0,
    max: 100,
    default: DEFAULT_ADMIN_SETTINGS.partnerCommissionPct
  },
  platformFeePaise: {
    type: Number,
    required: true,
    default: DEFAULT_ADMIN_SETTINGS.platformFeePaise
  },
  onePassPerPhone: {
    type: Boolean,
    default: DEFAULT_ADMIN_SETTINGS.onePassPerPhone
  },
  maxPassesPerPhone: {
    type: Number,
    default: DEFAULT_ADMIN_SETTINGS.maxPassesPerPhone
  },
  capacityLimit: {
    type: Number,
    default: DEFAULT_ADMIN_SETTINGS.capacityLimit
  },
  allowReentry: {
    type: Boolean,
    default: DEFAULT_ADMIN_SETTINGS.allowReentry
  },
  maxReentriesPerDay: {
    type: Number,
    default: DEFAULT_ADMIN_SETTINGS.maxReentriesPerDay
  },
  emergencyLockdown: {
    type: Boolean,
    default: DEFAULT_ADMIN_SETTINGS.emergencyLockdown
  },
  cashSalesEnabled: {
    type: Boolean,
    default: DEFAULT_ADMIN_SETTINGS.cashSalesEnabled
  },
  onlineSalesEnabled: {
    type: Boolean,
    default: DEFAULT_ADMIN_SETTINGS.onlineSalesEnabled
  },
  cashPriceMode: {
    type: String,
    enum: ['INCLUSIVE_TOTAL', 'ORGANIZER_ABSORBS_FEE'],
    default: DEFAULT_ADMIN_SETTINGS.cashPriceMode
  },
  reentryMode: {
    type: String,
    enum: ['IN_OUT', 'WRISTBAND'],
    default: DEFAULT_ADMIN_SETTINGS.reentryMode
  },
  tokenExpiryMinutes: {
    type: Number,
    default: DEFAULT_ADMIN_SETTINGS.tokenExpiryMinutes
  },
  gateOpenTime: {
    type: String,
    default: DEFAULT_ADMIN_SETTINGS.gateOpenTime
  },
  gateCloseTime: {
    type: String,
    default: DEFAULT_ADMIN_SETTINGS.gateCloseTime
  },
  salesCutoffDay3: {
    type: String,
    default: DEFAULT_ADMIN_SETTINGS.salesCutoffDay3
  },
  // Reusable Event Card Templates saved by Super Admin
  savedCardTemplates: [
    {
      templateId: { type: String, required: true },
      name: { type: String, required: true, trim: true },
      layout: { type: String, enum: ['standard', 'kolkata-dusk'], default: 'kolkata-dusk' },
      logoUrl: { type: String, trim: true, default: '' },
      watermarkUrl: { type: String, trim: true, default: '' },
      tagline: [{ type: String, trim: true }],
      colors: {
        ink: { type: String, default: '#0A0A0A' },
        orange: { type: String, default: '#FF7A1A' },
        burst: { type: String, default: '#F2FF00' },
        button: { type: String, default: '#FFC21A' },
        red: { type: String, default: '#E10600' }
      },
      cardDisplay: {
        showDays: { type: Boolean, default: true },
        showDailyCap: { type: Boolean, default: false },
        showTiers: { type: Boolean, default: false },
        customFields: [
          {
            label: { type: String, trim: true },
            value: { type: String, trim: true },
            icon: { type: String, default: 'CalendarDays' }
          }
        ]
      },
      announcementText: { type: String, default: '' },
      createdAt: { type: Date, default: Date.now }
    }
  ],
  eventDays: [
    {
      day: { type: Number, required: true },
      date: { type: String, required: true },
      label: { type: String }
    }
  ]
}, {
  timestamps: true
});

// Helper static method to get single settings or create default
adminSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create(DEFAULT_ADMIN_SETTINGS);
  }
  return settings;
};

export const AdminSettings = mongoose.model('AdminSettings', adminSettingsSchema);

