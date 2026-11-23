import mongoose from 'mongoose';
import dns from 'dns';
import dotenv from 'dotenv';
import { Event } from '../models/Event.js';

dotenv.config({ path: 'server/.env' });
dns.setServers(['8.8.8.8', '1.1.1.1']);

const run = async () => {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected.');

    const defaultTiers = [
      {
        tierId: 'general',
        name: 'General Comic Pass',
        pricePaise: 5000,
        platformFeePaise: 200,
        capacity: 2500,
        soldCount: 4,
        perks: ['3-Day Festival Access', 'Main Exhibition Hall', 'Artist Alley Entry'],
        color: 'yellow',
        allowedZones: ['MAIN_HALL', 'EXHIBIT_ZONE'],
        badge: 'GENERAL',
        active: true
      },
      {
        tierId: 'vip',
        name: 'VIP Superfan Pass',
        pricePaise: 15000,
        platformFeePaise: 400,
        capacity: 300,
        soldCount: 0,
        perks: ['Express Priority Gate', 'VIP Fan Lounge Access', 'Concert & Stage Front-Row', 'Complimentary Festival Poster'],
        color: 'gold',
        allowedZones: ['MAIN_HALL', 'EXHIBIT_ZONE', 'VIP_LOUNGE', 'STAGE_ARENA'],
        badge: 'VIP_SUPERFAN',
        active: true
      },
      {
        tierId: 'cosplay',
        name: 'Cosplay Creator Pass',
        pricePaise: 10000,
        platformFeePaise: 300,
        capacity: 200,
        soldCount: 0,
        perks: ['Cosplayer Green Room & Mirror Desk', 'Prop Check Priority', 'Cosplay Runway Stage Access'],
        color: 'magenta',
        allowedZones: ['MAIN_HALL', 'EXHIBIT_ZONE', 'STAGE_ARENA'],
        badge: 'COSPLAY_CREATOR',
        active: true
      }
    ];

    const defaultCoupons = [
      {
        code: 'COSPLAY20',
        discountType: 'PERCENT',
        discountValue: 20, // 20% off
        maxUses: 100,
        usedCount: 0,
        minOrderAmountPaise: 5000,
        active: true
      },
      {
        code: 'FLASH50',
        discountType: 'FLAT',
        discountValue: 5000, // Flat ₹50 off
        maxUses: 50,
        usedCount: 0,
        minOrderAmountPaise: 10000,
        active: true
      }
    ];

    const defaultAddOns = [
      {
        addOnId: 'tshirt-l',
        name: 'Official Comics Carnival T-Shirt',
        pricePaise: 29900, // ₹299
        category: 'MERCH',
        description: 'Premium 100% cotton official collectible superhero tee',
        icon: 'Shirt',
        inventory: 300,
        soldCount: 0,
        variants: ['S', 'M', 'L', 'XL', 'XXL'],
        active: true
      },
      {
        addOnId: 'food-combo',
        name: 'Superfan Snack & Beverage Box',
        pricePaise: 14900, // ₹149
        category: 'FOOD',
        description: 'Jumbo popcorn + cold beverage coupon at Food Court',
        icon: 'Utensils',
        inventory: 500,
        soldCount: 0,
        active: true
      },
      {
        addOnId: 'vip-parking',
        name: 'Guaranteed Venue Parking Pass',
        pricePaise: 10000, // ₹100
        category: 'PARKING',
        description: 'Designated 4-wheeler parking slot at Milan Mela Prangan',
        icon: 'Car',
        inventory: 150,
        soldCount: 0,
        active: true
      }
    ];

    const defaultAffiliates = [
      {
        code: 'sourav_cosplay',
        ambassadorName: 'Sourav Mukhopadhyay (Cosplay Ambassador)',
        commissionPct: 10,
        totalSalesPaise: 0,
        totalCommissionPaise: 0,
        ordersCount: 0,
        active: true
      },
      {
        code: 'kolkata_geeks',
        ambassadorName: 'Kolkata Geeks & Gamers Club',
        commissionPct: 8,
        totalSalesPaise: 0,
        totalCommissionPaise: 0,
        ordersCount: 0,
        active: true
      }
    ];

    const defaultZones = [
      {
        zoneId: 'MAIN_HALL',
        name: 'Main Exhibition Hall',
        gateIds: ['Gate 1', 'Gate 2', 'Gate 3'],
        requiredTiers: ['general', 'vip', 'cosplay']
      },
      {
        zoneId: 'VIP_LOUNGE',
        name: 'Exclusive VIP Fan Lounge',
        gateIds: ['Gate 4'],
        requiredTiers: ['vip']
      },
      {
        zoneId: 'STAGE_ARENA',
        name: 'Main Stage & Cosplay Arena',
        gateIds: ['Gate 3', 'Gate 4'],
        requiredTiers: ['vip', 'cosplay']
      }
    ];

    const defaultAnnouncements = [
      {
        id: 'ann-1',
        text: '🔥 Cosplay Runway Competition starts at 4:30 PM today at Stage Arena!',
        type: 'STAGE',
        createdAt: new Date(),
        active: true
      },
      {
        id: 'ann-2',
        text: '⚡ Express Ingress: Gate 2 has zero line for digital passes right now.',
        type: 'INFO',
        createdAt: new Date(),
        active: true
      }
    ];

    const events = await Event.find();
    console.log(`Found ${events.length} events to update.`);

    for (const ev of events) {
      if (!ev.ticketTiers || ev.ticketTiers.length === 0) {
        ev.ticketTiers = defaultTiers;
      }
      if (!ev.coupons || ev.coupons.length === 0) {
        ev.coupons = defaultCoupons;
      }
      if (!ev.addOns || ev.addOns.length === 0) {
        ev.addOns = defaultAddOns;
      }
      if (!ev.affiliates || ev.affiliates.length === 0) {
        ev.affiliates = defaultAffiliates;
      }
      if (!ev.zones || ev.zones.length === 0) {
        ev.zones = defaultZones;
      }
      if (!ev.liveAnnouncements || ev.liveAnnouncements.length === 0) {
        ev.liveAnnouncements = defaultAnnouncements;
      }
      if (!ev.emergencyEvacuation) {
        ev.emergencyEvacuation = {
          active: false,
          message: 'EMERGENCY EVACUATION ACTIVE - ALL GATES UNLOCKED FOR EXIT'
        };
      }
      await ev.save();
      console.log(`Updated event: ${ev.eventId} (${ev.name}) with all advanced features.`);
    }

    console.log('Advanced features seeding complete!');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding advanced features:', err);
    process.exit(1);
  }
};

run();
