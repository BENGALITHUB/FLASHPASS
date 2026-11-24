import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { AdminSettings } from '../models/AdminSettings.js';
import { Event } from '../models/Event.js';
import { Order } from '../models/Order.js';
import { ROLES, DEFAULT_ADMIN_SETTINGS } from '../constants/index.js';

export const seedDatabase = async () => {
  try {
    // 1. Seed AdminSettings
    const settingsCount = await AdminSettings.countDocuments();
    if (settingsCount === 0) {
      await AdminSettings.create(DEFAULT_ADMIN_SETTINGS);
      console.log('[Seed] Default AdminSettings created.');
    }

    // 1b. A brand-new database gets a demo event ('comics-carnival') with demo staff. Once any
    // event exists, nothing is added back: a deleted event, the demo one included, stays deleted.
    const freshInstall = (await Event.countDocuments()) === 0 && !(await Order.exists({}));
    if (freshInstall) {
      await Event.create({
        eventId: 'comics-carnival',
        name: DEFAULT_ADMIN_SETTINGS.eventName,
        venue: DEFAULT_ADMIN_SETTINGS.venue,
        announcementText: DEFAULT_ADMIN_SETTINGS.announcementText,
        basePricePaise: DEFAULT_ADMIN_SETTINGS.basePricePaise,
        platformFeePaise: DEFAULT_ADMIN_SETTINGS.platformFeePaise,
        capacityLimit: DEFAULT_ADMIN_SETTINGS.capacityLimit,
        allowReentry: DEFAULT_ADMIN_SETTINGS.allowReentry,
        maxReentriesPerDay: DEFAULT_ADMIN_SETTINGS.maxReentriesPerDay,
        eventDays: DEFAULT_ADMIN_SETTINGS.eventDays,
        status: 'ACTIVE'
      });
      console.log('[Seed] Default Event created: comics-carnival');
    }

    // 2. Seed Default Super Admin
    const defaultPin = process.env.DEFAULT_ADMIN_PIN || '123456';
    const adminUser = await User.findOne({ username: 'admin' });

    if (!adminUser) {
      const pinHash = await bcrypt.hash(defaultPin, 12);
      await User.create({
        username: 'admin',
        name: 'Platform Super Admin',
        pinHash,
        role: ROLES.SUPER_ADMIN,
        active: true
      });
      console.log(`[Seed] Super Admin created: username="admin", PIN="${defaultPin}"`);
    } else if (adminUser.role !== ROLES.SUPER_ADMIN) {
      adminUser.role = ROLES.SUPER_ADMIN;
      await adminUser.save();
    }

    // 2b. Demo staff for the demo event, on a brand-new database only.
    if (!freshInstall) return;
    const eventAdminUser = await User.findOne({ username: 'carnival_admin' });
    if (!eventAdminUser) {
      const eventAdminPinHash = await bcrypt.hash('333333', 12);
      await User.create({
        username: 'carnival_admin',
        name: 'Carnival Organizer',
        pinHash: eventAdminPinHash,
        role: ROLES.EVENT_ADMIN,
        assignedEventId: 'comics-carnival',
        active: true
      });
      console.log('[Seed] Event Admin created: username="carnival_admin", PIN="333333"');
    }

    // 3. Seed demo Cashier and Gate Volunteer for testing
    const cashierUser = await User.findOne({ username: 'cashier1' });
    if (!cashierUser) {
      const cashierPinHash = await bcrypt.hash('111111', 12);
      await User.create({
        username: 'cashier1',
        name: 'Rina (Box Office)',
        pinHash: cashierPinHash,
        role: ROLES.CASHIER,
        assignedEventId: 'comics-carnival',
        active: true
      });
      console.log('[Seed] Cashier created: username="cashier1", PIN="111111"');
    }

    const gateUser = await User.findOne({ username: 'gate1' });
    if (!gateUser) {
      const gatePinHash = await bcrypt.hash('222222', 12);
      await User.create({
        username: 'gate1',
        name: 'Amit (Gate Volunteer)',
        pinHash: gatePinHash,
        role: ROLES.GATE,
        assignedEventId: 'comics-carnival',
        active: true
      });
      console.log('[Seed] Gate Volunteer created: username="gate1", PIN="222222"');
    }
  } catch (error) {
    console.error('[Seed Error]', error.message);
  }
};

