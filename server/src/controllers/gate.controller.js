import crypto from 'crypto';
import { Pass } from '../models/Pass.js';
import { Order } from '../models/Order.js';
import { Event } from '../models/Event.js';
import { ScanLog } from '../models/ScanLog.js';
import { AdminSettings } from '../models/AdminSettings.js';
import { verifyQRToken, generateQRToken } from '../services/qr.service.js';
import { getCurrentEventDay, getISTNow } from '../utils/date.utils.js';
import { emitGateStats } from '../services/socket.service.js';
import { getCachedSettings, getCachedEvent } from '../services/configCache.js';
import { successResponse, errorResponse } from '../utils/response.utils.js';
import { GATE_MODES, SCAN_RESULTS, PRESENCE, PASS_STATUS, REENTRY_MODES } from '../constants/index.js';

/**
 * POST /api/v1/gate/scan
 * Ultra-fast sub-150ms scan processing with atomic anti-passback
 */
export const scanPass = async (req, res) => {
  const startTime = Date.now();
  const { qrToken, orderId, gateId = 'Gate 1', mode = GATE_MODES.ENTRY, deviceId = 'dev-1' } = req.body;
  const volunteerId = req.user ? req.user._id : null;

  try {
    const settings = await getCachedSettings();
    const eventDay = getCurrentEventDay(settings.eventDays) || 1;

    let targetPassId = null;
    let tokenNonce = null;
    let pass = null;
    // Every scan log carries the pass's event so per-event footfall stays correct
    const log = (data) => logScan({ eventId: pass?.eventId || undefined, ...data });

    // 1. Verify QR token signature (constant time, no DB call if invalid)
    if (qrToken) {
      const verifyResult = verifyQRToken(qrToken);
      if (!verifyResult.valid) {
        await log({
          passId: null,
          orderId: null,
          eventDay,
          direction: mode,
          result: SCAN_RESULTS.INVALID_QR,
          gateId,
          deviceId,
          userId: volunteerId,
          latencyMs: Date.now() - startTime
        });

        return successResponse(res, {
          result: SCAN_RESULTS.INVALID_QR,
          message: 'INVALID PASS ✕ Not a Comics Carnival pass. Send to Help Desk.',
          latencyMs: Date.now() - startTime
        });
      }
      targetPassId = verifyResult.passId;
      tokenNonce = verifyResult.qrNonce;
    }

    // 2. Load Pass
    if (targetPassId) {
      pass = await Pass.findById(targetPassId);
    } else if (orderId) {
      pass = await Pass.findOne({ orderId: String(orderId).trim().toUpperCase() });
    }

    if (!pass) {
      await log({
        passId: null,
        orderId: orderId || null,
        eventDay,
        direction: mode,
        result: SCAN_RESULTS.INVALID_QR,
        gateId,
        deviceId,
        userId: volunteerId,
        latencyMs: Date.now() - startTime
      });

      return successResponse(res, {
        result: SCAN_RESULTS.INVALID_QR,
        message: 'PASS NOT FOUND ✕ No ticket matches this code.',
        latencyMs: Date.now() - startTime
      });
    }

    // 2b. The QR must carry the pass's current nonce. A pass reissued at the help
    // desk gets a new nonce, so the old QR / screenshot stops working, and a QR
    // can't be made from a pass ID alone.
    if (tokenNonce !== null && tokenNonce !== pass.qrNonce) {
      await log({
        passId: pass._id, orderId: pass.orderId, eventDay, direction: mode,
        result: SCAN_RESULTS.INVALID_QR, gateId, deviceId, userId: volunteerId,
        latencyMs: Date.now() - startTime
      });
      return successResponse(res, {
        result: SCAN_RESULTS.INVALID_QR,
        message: 'OLD OR FAKE QR ✕ This pass was reissued. Ask for the latest pass, or send to Help Desk.',
        holderName: pass.holderName,
        latencyMs: Date.now() - startTime
      });
    }

    // 3. Status checks
    if (pass.status === PASS_STATUS.VOIDED) {
      await log({
        passId: pass._id,
        orderId: pass.orderId,
        eventDay,
        direction: mode,
        result: SCAN_RESULTS.VOIDED,
        gateId,
        deviceId,
        userId: volunteerId,
        latencyMs: Date.now() - startTime
      });

      return successResponse(res, {
        result: SCAN_RESULTS.VOIDED,
        message: 'PASS CANCELLED ✕ This ticket was voided or refunded. Send to Help Desk.',
        holderName: pass.holderName,
        photoUrl: pass.photoUrl || null,
        latencyMs: Date.now() - startTime
      });
    }

    // 4. Validity Day Check
    if (!pass.validDays.includes(eventDay)) {
      await log({
        passId: pass._id,
        orderId: pass.orderId,
        eventDay,
        direction: mode,
        result: SCAN_RESULTS.NOT_VALID_TODAY,
        gateId,
        deviceId,
        userId: volunteerId,
        latencyMs: Date.now() - startTime
      });

      return successResponse(res, {
        result: SCAN_RESULTS.NOT_VALID_TODAY,
        message: `NOT VALID TODAY ✕ This pass is not valid for Day ${eventDay}.`,
        badge: pass.badge,
        validDays: pass.validDays,
        holderName: pass.holderName,
        photoUrl: pass.photoUrl || null,
        latencyMs: Date.now() - startTime
      });
    }

    // 5. Gate Hours Check
    const istNow = getISTNow();
    const currentTimeStr = `${String(istNow.getHours()).padStart(2, '0')}:${String(istNow.getMinutes()).padStart(2, '0')}`;
    if (settings.gateOpenTime && settings.gateCloseTime) {
      if (currentTimeStr < settings.gateOpenTime || currentTimeStr > settings.gateCloseTime) {
        await log({
          passId: pass._id,
          orderId: pass.orderId,
          eventDay,
          direction: mode,
          result: SCAN_RESULTS.OUTSIDE_GATE_HOURS,
          gateId,
          deviceId,
          userId: volunteerId,
          latencyMs: Date.now() - startTime
        });

        return successResponse(res, {
          result: SCAN_RESULTS.OUTSIDE_GATE_HOURS,
          message: `GATES CLOSED ✕ Gate hours are ${settings.gateOpenTime} to ${settings.gateCloseTime}.`,
          latencyMs: Date.now() - startTime
        });
      }
    }

    // 5b. Emergency Evacuation Broadcast Check
    const event = await getCachedEvent(pass.eventId);
    // The admin dashboard saves gate rules on the event; fall back to global settings
    const reentryMode = event?.reentryMode || settings.reentryMode || REENTRY_MODES.IN_OUT;
    const stampMode = reentryMode === REENTRY_MODES.WRISTBAND;
    const allowReentry = event ? event.allowReentry !== false : settings.allowReentry !== false;
    const maxReentriesPerDay = event ? (event.maxReentriesPerDay ?? 0) : (settings.maxReentriesPerDay ?? 0);
    const emergencyLockdown = Boolean(settings.emergencyLockdown || event?.emergencyLockdown);

    if (event?.emergencyEvacuation?.active) {
      pass.presence = PRESENCE.OUTSIDE;
      await pass.save();
      await log({
        passId: pass._id,
        orderId: pass.orderId,
        eventDay,
        direction: GATE_MODES.EXIT,
        result: 'EVACUATION_EXIT',
        gateId,
        deviceId,
        userId: volunteerId,
        latencyMs: Date.now() - startTime
      });

      return successResponse(res, {
        result: 'EVACUATION_EXIT',
        message: '🚨 EMERGENCY EVACUATION ACTIVE - FREE EXIT CONFIRMED',
        holderName: pass.holderName,
        photoUrl: pass.photoUrl || null,
        latencyMs: Date.now() - startTime
      });
    }

    // 5c. Multi-Zone / Hall Access Control Check
    if (mode === GATE_MODES.ENTRY && event?.zones && event.zones.length > 0) {
      // Find if this gate belongs to a restricted zone
      const targetZone = event.zones.find(z => z.gateIds?.includes(gateId) || z.zoneId === gateId);
      if (targetZone && Array.isArray(targetZone.requiredTiers) && targetZone.requiredTiers.length > 0) {
        const attendeeTier = pass.tierId || 'general';
        const hasZoneAccess = targetZone.requiredTiers.includes(attendeeTier) || (pass.allowedZones && pass.allowedZones.includes(targetZone.zoneId));
        if (!hasZoneAccess) {
          await log({
            passId: pass._id,
            orderId: pass.orderId,
            eventDay,
            direction: mode,
            result: 'ZONE_ACCESS_DENIED',
            gateId,
            deviceId,
            userId: volunteerId,
            latencyMs: Date.now() - startTime
          });

          return successResponse(res, {
            result: 'ZONE_ACCESS_DENIED',
            message: `ZONE ACCESS DENIED ✕ ${targetZone.name} is restricted to [${targetZone.requiredTiers.join(', ').toUpperCase()}] passes only.`,
            holderName: pass.holderName,
            photoUrl: pass.photoUrl || null,
            tierName: pass.tierName,
            badge: pass.badge,
            latencyMs: Date.now() - startTime
          });
        }
      }
    }

    // 5d. Emergency Lockdown Check
    if (emergencyLockdown) {
      await log({
        passId: pass._id,
        orderId: pass.orderId,
        eventDay,
        direction: mode,
        result: SCAN_RESULTS.EMERGENCY_LOCKDOWN,
        gateId,
        deviceId,
        userId: volunteerId,
        latencyMs: Date.now() - startTime
      });

      return successResponse(res, {
        result: SCAN_RESULTS.EMERGENCY_LOCKDOWN,
        message: 'GATES TEMPORARILY LOCKED ✕ Super Admin emergency pause is active.',
        latencyMs: Date.now() - startTime
      });
    }

    // 5e. Hand-stamp mode: one scan per pass per day, nobody is scanned out.
    // Whoever comes back shows the stamp and walks in without a scan, so a
    // second scan of the same pass today means someone is reusing it.
    if (stampMode) {
      if (mode !== GATE_MODES.ENTRY) {
        return successResponse(res, {
          result: 'EXIT_NOT_NEEDED',
          message: 'STAMP MODE — Exit scanning is off. People going out keep their hand stamp; no scan needed.',
          latencyMs: Date.now() - startTime
        });
      }

      // Atomic: only the first scan of the day can add today to firstEntryDays,
      // so two gates scanning the same screenshot at once get exactly one green.
      const scannedAt = new Date();
      const admitted = await Pass.findOneAndUpdate(
        { _id: pass._id, status: PASS_STATUS.ACTIVE, firstEntryDays: { $ne: eventDay } },
        {
          $addToSet: { firstEntryDays: eventDay },
          $set: { lastScan: { at: scannedAt, gateId, deviceId, direction: GATE_MODES.ENTRY } },
          $inc: { [`entriesByDay.${eventDay}`]: 1 }
        },
        { new: true }
      );

      if (!admitted) {
        const freshPass = await Pass.findById(pass._id).lean();
        if (!freshPass || !freshPass.firstEntryDays?.includes(eventDay)) {
          // Not a repeat scan: the pass stopped being ACTIVE between the checks
          await log({
            passId: pass._id, orderId: pass.orderId, eventDay, direction: mode,
            result: SCAN_RESULTS.VOIDED, gateId, deviceId, userId: volunteerId,
            latencyMs: Date.now() - startTime
          });
          return successResponse(res, {
            result: SCAN_RESULTS.VOIDED,
            message: 'PASS NOT ACTIVE ✕ Send to Help Desk.',
            holderName: pass.holderName,
            latencyMs: Date.now() - startTime
          });
        }

        const firstAt = freshPass.lastScan?.at
          ? new Date(freshPass.lastScan.at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
          : 'earlier today';
        const firstGate = freshPass.lastScan?.gateId || 'a gate';

        await log({
          passId: pass._id, orderId: pass.orderId, eventDay, direction: mode,
          result: SCAN_RESULTS.ALREADY_USED_TODAY, gateId, deviceId, userId: volunteerId,
          latencyMs: Date.now() - startTime
        });

        return successResponse(res, {
          result: SCAN_RESULTS.ALREADY_USED_TODAY,
          message: `This pass already entered today at ${firstAt} via ${firstGate}. CHECK HAND STAMP — no stamp, no entry.`,
          holderName: pass.holderName,
          photoUrl: pass.photoUrl || null,
          firstEntryAt: firstAt,
          firstEntryGate: firstGate,
          latencyMs: Date.now() - startTime
        });
      }

      await log({
        passId: pass._id, orderId: pass.orderId, eventDay, direction: mode,
        result: SCAN_RESULTS.ENTRY_OK, isFirstEntryOfDay: true,
        gateId, deviceId, userId: volunteerId,
        latencyMs: Date.now() - startTime
      });

      broadcastUpdatedStats(eventDay);

      return successResponse(res, {
        result: SCAN_RESULTS.ENTRY_OK,
        isFirstEntry: true,
        message: `WELCOME! ✓ Day ${eventDay} — stamp the hand`,
        holderName: pass.holderName,
        badge: pass.badge,
        photoUrl: pass.photoUrl || null,
        entriesToday: 1,
        latencyMs: Date.now() - startTime
      });
    }

    // 5c. Re-entry Policy Check (if attendee already entered today)
    const entriesTodaySoFar = pass.entriesByDay?.get(String(eventDay)) || 0;
    if (mode === GATE_MODES.ENTRY && entriesTodaySoFar >= 1) {
      if (!allowReentry) {
        await log({
          passId: pass._id,
          orderId: pass.orderId,
          eventDay,
          direction: mode,
          result: SCAN_RESULTS.REENTRY_DISABLED,
          gateId,
          deviceId,
          userId: volunteerId,
          latencyMs: Date.now() - startTime
        });

        return successResponse(res, {
          result: SCAN_RESULTS.REENTRY_DISABLED,
          message: 'RE-ENTRY NOT ALLOWED ✕ This event has a Single-Entry policy.',
          holderName: pass.holderName,
          photoUrl: pass.photoUrl || null,
          latencyMs: Date.now() - startTime
        });
      }

      if (maxReentriesPerDay > 0 && entriesTodaySoFar >= maxReentriesPerDay) {
        await log({
          passId: pass._id,
          orderId: pass.orderId,
          eventDay,
          direction: mode,
          result: SCAN_RESULTS.MAX_REENTRIES_EXCEEDED,
          gateId,
          deviceId,
          userId: volunteerId,
          latencyMs: Date.now() - startTime
        });

        return successResponse(res, {
          result: SCAN_RESULTS.MAX_REENTRIES_EXCEEDED,
          message: `MAX RE-ENTRIES REACHED ✕ Daily limit of ${maxReentriesPerDay} entries reached for today.`,
          holderName: pass.holderName,
          photoUrl: pass.photoUrl || null,
          latencyMs: Date.now() - startTime
        });
      }
    }

    // 6. Execution: ENTRY Mode
    if (mode === GATE_MODES.ENTRY) {
      // Atomic conditional update to block screenshot double entries
      const updatedPass = await Pass.findOneAndUpdate(
        {
          _id: pass._id,
          status: PASS_STATUS.ACTIVE,
          presence: PRESENCE.OUTSIDE
        },
        {
          $set: {
            presence: PRESENCE.INSIDE,
            lastScan: {
              at: new Date(),
              gateId,
              deviceId,
              direction: GATE_MODES.ENTRY
            }
          },
          $inc: {
            [`entriesByDay.${eventDay}`]: 1
          }
        },
        { new: true }
      );

      // If update failed, it was already inside or race condition
      if (!updatedPass) {
        const freshPass = await Pass.findById(pass._id);
        const lastTime = freshPass.lastScan?.at ? new Date(freshPass.lastScan.at).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : 'earlier';
        const lastGate = freshPass.lastScan?.gateId || 'Gate';

        await log({
          passId: pass._id,
          orderId: pass.orderId,
          eventDay,
          direction: mode,
          result: SCAN_RESULTS.ALREADY_INSIDE,
          gateId,
          deviceId,
          userId: volunteerId,
          latencyMs: Date.now() - startTime
        });

        return successResponse(res, {
          result: SCAN_RESULTS.ALREADY_INSIDE,
          message: `ALREADY INSIDE ✕ Entered at ${lastTime} via ${lastGate}. Ask for original pass holder.`,
          holderName: pass.holderName,
          photoUrl: pass.photoUrl || null,
          lastScan: freshPass.lastScan,
          latencyMs: Date.now() - startTime
        });
      }

      // Check first entry of day
      const isFirst = !pass.firstEntryDays.includes(eventDay);
      if (isFirst) {
        await Pass.updateOne(
          { _id: pass._id },
          { $addToSet: { firstEntryDays: eventDay } }
        );
      }

      const totalToday = (updatedPass.entriesByDay?.get(String(eventDay)) || 1);

      await log({
        passId: pass._id,
        orderId: pass.orderId,
        eventDay,
        direction: mode,
        result: SCAN_RESULTS.ENTRY_OK,
        isFirstEntryOfDay: isFirst,
        gateId,
        deviceId,
        userId: volunteerId,
        latencyMs: Date.now() - startTime
      });

      // Broadcast live crowd stats
      broadcastUpdatedStats(eventDay);

      return successResponse(res, {
        result: SCAN_RESULTS.ENTRY_OK,
        isFirstEntry: isFirst,
        message: isFirst ? `WELCOME! ✓ Day ${eventDay}` : `WELCOME BACK ✓ Entry #${totalToday} today`,
        holderName: pass.holderName,
        badge: pass.badge,
        photoUrl: pass.photoUrl || null,
        entriesToday: totalToday,
        latencyMs: Date.now() - startTime
      });
    }

    // 7. Execution: EXIT Mode
    if (mode === GATE_MODES.EXIT) {
      if (pass.presence === PRESENCE.OUTSIDE) {
        await log({
          passId: pass._id,
          orderId: pass.orderId,
          eventDay,
          direction: mode,
          result: SCAN_RESULTS.EXIT_NOT_INSIDE,
          gateId,
          deviceId,
          userId: volunteerId,
          latencyMs: Date.now() - startTime
        });

        return successResponse(res, {
          result: SCAN_RESULTS.EXIT_NOT_INSIDE,
          message: 'NOT CHECKED IN ! Let them exit. Logged for review.',
          holderName: pass.holderName,
          latencyMs: Date.now() - startTime
        });
      }

      await Pass.updateOne(
        { _id: pass._id },
        {
          $set: {
            presence: PRESENCE.OUTSIDE,
            lastScan: {
              at: new Date(),
              gateId,
              deviceId,
              direction: GATE_MODES.EXIT
            }
          }
        }
      );

      await log({
        passId: pass._id,
        orderId: pass.orderId,
        eventDay,
        direction: mode,
        result: SCAN_RESULTS.EXIT_OK,
        gateId,
        deviceId,
        userId: volunteerId,
        latencyMs: Date.now() - startTime
      });

      broadcastUpdatedStats(eventDay);

      return successResponse(res, {
        result: SCAN_RESULTS.EXIT_OK,
        message: 'SEE YOU SOON ↗ Re-entry allowed',
        holderName: pass.holderName,
        photoUrl: pass.photoUrl || null,
        latencyMs: Date.now() - startTime
      });
    }
  } catch (error) {
    return errorResponse(res, error.message, 'SCAN_ERROR', 500);
  }
};

/**
 * Helper to log scan
 */
async function logScan(data) {
  try {
    await ScanLog.create(data);
  } catch (e) {
    console.error('ScanLog creation error:', e.message);
  }
}

/**
 * Broadcast live presence stats
 */
async function countTodayFootfall(eventDay) {
  return ScanLog.countDocuments({ eventDay, result: SCAN_RESULTS.ENTRY_OK, isFirstEntryOfDay: true });
}

// At a busy gate (60 scans/s) recounting after every scan would add two
// count queries per scan. Instead, send at most one update per second.
let statsTimer = null;
let statsDay = null;
function broadcastUpdatedStats(eventDay) {
  statsDay = eventDay || statsDay;
  if (statsTimer) return;
  statsTimer = setTimeout(() => {
    statsTimer = null;
    sendStats(statsDay);
  }, 1000);
  statsTimer.unref?.();
}

async function sendStats(eventDay) {
  try {
    const insideNow = await Pass.countDocuments({ presence: PRESENCE.INSIDE });
    const stats = { insideNow };
    if (eventDay) stats.todayFootfall = await countTodayFootfall(eventDay);
    emitGateStats(stats);
  } catch (e) {
    console.error('Stats broadcast error:', e.message);
  }
}

/**
 * GET /api/v1/gate/stats
 * Also tells the scanner which re-entry mode the event runs in.
 */
export const getGateStats = async (req, res) => {
  try {
    const settings = await AdminSettings.getSettings();
    const eventDay = getCurrentEventDay(settings.eventDays) || 1;
    const eventId = String(req.query.eventId || 'comics-carnival').trim().toLowerCase();
    const event = await Event.findOne({ eventId }).select('reentryMode'); // not lean: schema default applies to older events

    const insideNow = await Pass.countDocuments({ presence: PRESENCE.INSIDE });
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const scansLastHour = await ScanLog.countDocuments({ at: { $gte: oneHourAgo } });
    const todayFootfall = await countTodayFootfall(eventDay);

    return successResponse(res, {
      insideNow,
      scansLastHour,
      todayFootfall,
      eventDay,
      reentryMode: event?.reentryMode || settings.reentryMode || REENTRY_MODES.IN_OUT
    });
  } catch (error) {
    return errorResponse(res, error.message, 'GATE_STATS_ERROR', 500);
  }
};

/**
 * GET /api/v1/gate/helpdesk/search
 * Search pass by Phone, OrderId, or Name for Lost Phone / Helpdesk desk
 */
export const helpdeskSearchPasses = async (req, res) => {
  try {
    const { q, eventId } = req.query;
    if (!q || q.trim().length === 0) {
      return successResponse(res, []);
    }

    const query = q.trim();
    const filter = {
      $or: [
        { phone: new RegExp(query, 'i') },
        { orderId: new RegExp(query, 'i') },
        { holderName: new RegExp(query, 'i') }
      ]
    };
    if (eventId && eventId !== 'ALL') {
      filter.eventId = eventId;
    }

    const passes = await Pass.find(filter).sort({ createdAt: -1 }).limit(10).lean();
    const enriched = passes.map(p => ({
      ...p,
      passId: p._id.toString(),
      qrToken: generateQRToken(p._id.toString(), p.qrNonce)
    }));

    return successResponse(res, enriched);
  } catch (error) {
    return errorResponse(res, error.message, 'HELPDESK_SEARCH_ERROR', 500);
  }
};

/**
 * POST /api/v1/gate/helpdesk/reissue
 * Invalidate lost phone QR and reissue fresh secure QR pass
 */
export const helpdeskReissuePass = async (req, res) => {
  try {
    const { passId, pass_id, id, reason = 'Lost Phone / Dead Battery' } = req.body;
    const targetId = passId || pass_id || id;
    if (!targetId) {
      return errorResponse(res, 'Pass ID is required', 'MISSING_PASS_ID', 400);
    }

    const pass = await Pass.findById(targetId);
    if (!pass) {
      return errorResponse(res, 'Pass not found', 'NOT_FOUND', 404);
    }

    // Refresh qrNonce to immediately invalidate old screenshot/token
    const oldNonce = pass.qrNonce;
    pass.qrNonce = crypto.randomBytes(16).toString('hex');
    pass.reissueReason = reason;
    await pass.save();

    const newQrToken = generateQRToken(pass._id.toString(), pass.qrNonce);

    return successResponse(res, {
      message: `Pass ${pass.orderId} reissued successfully! Old QR code is now invalid.`,
      pass: {
        passId: pass._id,
        orderId: pass.orderId,
        holderName: pass.holderName,
        phone: pass.phone,
        badge: pass.badge,
        tierName: pass.tierName,
        presence: pass.presence,
        photoUrl: pass.photoUrl,
        newQrToken
      }
    });
  } catch (error) {
    return errorResponse(res, error.message, 'HELPDESK_REISSUE_ERROR', 500);
  }
};

/**
 * POST /api/v1/gate/merch/claim
 * Scan & claim add-on merchandise (T-Shirt, Food combo, Parking voucher)
 */
export const claimAddOnVoucher = async (req, res) => {
  try {
    const { orderId, addOnId } = req.body;
    if (!orderId || !addOnId) {
      return errorResponse(res, 'Order ID and Add-on ID are required', 'MISSING_PARAMS', 400);
    }

    const order = await Order.findOne({ orderId: String(orderId).trim().toUpperCase() });
    if (!order) {
      return errorResponse(res, 'Order not found', 'NOT_FOUND', 404);
    }

    const matchedItem = order.addOns?.find(a => a.addOnId === addOnId);
    if (!matchedItem) {
      return errorResponse(res, 'This item is not part of the attendee order', 'NOT_FOUND', 404);
    }

    if (matchedItem.claimed) {
      return successResponse(res, {
        alreadyClaimed: true,
        message: `ALREADY CLAIMED ✕ This ${matchedItem.name} was already picked up on ${new Date(matchedItem.claimedAt).toLocaleString('en-IN')}`,
        claimedAt: matchedItem.claimedAt,
        item: matchedItem
      });
    }

    matchedItem.claimed = true;
    matchedItem.claimedAt = new Date();
    await order.save();

    // Also update on related pass
    await Pass.updateMany(
      { orderId: order.orderId, 'addOns.addOnId': addOnId },
      { $set: { 'addOns.$.claimed': true, 'addOns.$.claimedAt': new Date() } }
    );

    return successResponse(res, {
      success: true,
      message: `CLAIM VERIFIED ✓ Hand over ${matchedItem.quantity}x ${matchedItem.name}`,
      item: matchedItem,
      holderName: order.holderName
    });
  } catch (error) {
    return errorResponse(res, error.message, 'CLAIM_ERROR', 500);
  }
};

