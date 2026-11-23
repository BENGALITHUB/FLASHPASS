import crypto from 'crypto';
import { CashToken } from '../models/CashToken.js';
import { AdminSettings } from '../models/AdminSettings.js';
import { Pass } from '../models/Pass.js';
import { getCurrentEventDay } from '../utils/date.utils.js';
import { generateQRToken } from '../services/qr.service.js';
import { successResponse, errorResponse } from '../utils/response.utils.js';
import { CASH_TOKEN_STATUS, PASS_STATUS } from '../constants/index.js';

/**
 * POST /api/v1/cash-tokens
 * Self-service cash token generation at the venue
 */
export const createCashToken = async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || name.trim().length < 2) {
      return errorResponse(res, 'Please enter a valid name', 'INVALID_NAME', 400);
    }

    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return errorResponse(res, 'Enter a valid 10-digit mobile number', 'INVALID_PHONE', 400);
    }

    const settings = await AdminSettings.getSettings();
    const eventDay = getCurrentEventDay(settings.eventDays) || 1;

    // Check one pass per phone rule
    if (settings.onePassPerPhone) {
      const existingPass = await Pass.findOne({ phone: cleanPhone, status: PASS_STATUS.ACTIVE });
      if (existingPass) {
        return successResponse(res, {
          existingPass: true,
          orderId: existingPass.orderId,
          message: 'You already have an active pass'
        }, 200);
      }
    }

    // Check if user already has an OPEN token
    const existingToken = await CashToken.findOne({
      phone: cleanPhone,
      status: CASH_TOKEN_STATUS.OPEN,
      expiresAt: { $gt: new Date() }
    });

    if (existingToken) {
      return successResponse(res, {
        token: existingToken,
        message: 'Existing open token retrieved'
      }, 200);
    }

    // Determine sequential token number for today
    const lastToken = await CashToken.findOne({ eventDay }).sort({ tokenNo: -1 });
    const nextTokenNo = lastToken ? lastToken.tokenNo + 1 : 1;
    const displayToken = `C-${String(nextTokenNo).padStart(3, '0')}`;
    const checkCode = crypto.randomBytes(1).toString('hex').toUpperCase(); // 2 chars e.g. "7F"

    const expiryMs = (settings.tokenExpiryMinutes || 30) * 60 * 1000;
    const expiresAt = new Date(Date.now() + expiryMs);

    const cashAmountPaise = settings.cashPriceMode === 'ORGANIZER_ABSORBS_FEE' 
      ? settings.basePricePaise 
      : (settings.basePricePaise + settings.platformFeePaise);

    const token = await CashToken.create({
      tokenNo: nextTokenNo,
      display: displayToken,
      checkCode,
      eventDay,
      holderName: name.trim(),
      phone: cleanPhone,
      status: CASH_TOKEN_STATUS.OPEN,
      expiresAt
    });

    return successResponse(res, {
      token,
      amountPaise: cashAmountPaise,
      amountRupees: (cashAmountPaise / 100).toFixed(2),
      expiresAt
    }, 201);
  } catch (error) {
    return errorResponse(res, error.message, 'TOKEN_CREATION_FAILED', 500);
  }
};

/**
 * GET /api/v1/cash-tokens/:id
 * Check cash token status
 */
export const getCashTokenStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const token = await CashToken.findById(id);

    if (!token) {
      return errorResponse(res, 'Token not found', 'NOT_FOUND', 404);
    }

    // Check expiration
    if (token.status === CASH_TOKEN_STATUS.OPEN && new Date() > token.expiresAt) {
      token.status = CASH_TOKEN_STATUS.EXPIRED;
      await token.save();
    }

    let passData = null;
    if (token.status === CASH_TOKEN_STATUS.PAID && token.orderId) {
      const pass = await Pass.findOne({ orderId: token.orderId });
      if (pass) {
        const qrToken = generateQRToken(pass._id.toString(), pass.qrNonce);
        passData = {
          passId: pass._id,
          holderName: pass.holderName,
          phone: pass.phone,
          maskedPhone: pass.phone.replace(/(\d{2})\d{5}(\d{3})/, '$1•••••$2'),
          badge: pass.badge,
          validDays: pass.validDays,
          status: pass.status,
          presence: pass.presence,
          qrToken,
          orderId: pass.orderId
        };
      }
    }

    return successResponse(res, {
      token,
      pass: passData
    });
  } catch (error) {
    return errorResponse(res, error.message, 'TOKEN_STATUS_ERROR', 500);
  }
};

