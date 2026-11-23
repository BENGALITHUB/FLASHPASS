import express from 'express';
import {
  createOrder,
  getOrderStatus,
  mockPayOrder,
  validateCoupon,
  handlePayUCallback,
  getOrderPayUParams,
  verifyGatewayPayment
} from '../controllers/order.controller.js';
import { orderCreationLimiter, generalLimiter } from '../middleware/rateLimiter.middleware.js';

const router = express.Router();

// PayU Webhook / Redirect callback (handles both POST and GET)
router.all('/payu/callback', handlePayUCallback);

router.post('/', orderCreationLimiter, createOrder);
router.post('/validate-coupon', generalLimiter, validateCoupon);
router.get('/:orderId/status', generalLimiter, getOrderStatus);
router.get('/:orderId/payu-params', generalLimiter, getOrderPayUParams);
router.post('/:orderId/verify-gateway', generalLimiter, verifyGatewayPayment);
router.post('/:orderId/mock-pay', generalLimiter, mockPayOrder);

export default router;

