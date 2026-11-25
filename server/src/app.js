import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Route imports
import eventRoutes from './routes/event.routes.js';
import orderRoutes from './routes/order.routes.js';
import passRoutes from './routes/pass.routes.js';
import cashRoutes from './routes/cash.routes.js';
import posRoutes from './routes/pos.routes.js';
import gateRoutes from './routes/gate.routes.js';
import adminRoutes from './routes/admin.routes.js';
import authRoutes from './routes/auth.routes.js';
import inquiryRoutes from './routes/inquiry.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Behind nginx / cPanel / a load balancer, set TRUST_PROXY=1 so rate limits see
// each visitor's real IP instead of the proxy's (which would be shared by everyone)
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isNaN(hops) ? process.env.TRUST_PROXY : hops);
}

// Security & Middlewares
app.use(helmet({
  contentSecurityPolicy: false // Allow inline scripts/styles for client-side builds
}));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Health Check
app.get('/api/v1/health', (req, res) => {
  res.json({
    ok: true,
    data: {
      status: 'active',
      service: 'FlashPass Ingress & Ticketing Engine',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    }
  });
});

// Mount API Routes
app.use('/api/v1/event', eventRoutes);
app.use('/api/v1/events', eventRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/passes', passRoutes);
app.use('/api/v1/cash-tokens', cashRoutes);
app.use('/api/v1/pos', posRoutes);
app.use('/api/v1/gate', gateRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/inquiries', inquiryRoutes);

// Production Static Serving (cPanel / AWS Compatibility)
// If client/dist exists, Express will serve the React frontend seamlessly
const clientDistPath = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html') || filePath.endsWith('sw.js') || filePath.endsWith('version.json')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));

  // Catch-all for React Client Routing (excluding /api and missing static /assets/ chunks)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/assets/') || req.path === '/version.json') {
      return next();
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// Global 404 handler for unknown API routes
app.use('*', (req, res) => {
  res.status(404).json({
    ok: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Endpoint ${req.originalUrl} not found`
    }
  });
});

export default app;
