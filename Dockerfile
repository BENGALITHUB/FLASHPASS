# ==============================================================================
# FlashPass Ticketing & Gate Control System - Production Dockerfile
# Multi-stage build for minimal size, high security, and unified static serving
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build React Frontend
# ------------------------------------------------------------------------------
FROM node:20-alpine AS client-builder
WORKDIR /app/client

# Copy client dependency definitions first for optimal layer caching
COPY client/package*.json ./
RUN npm ci

# Copy client source code and compile Vite production bundle
COPY client/ ./
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Install Server Production Dependencies
# ------------------------------------------------------------------------------
FROM node:20-alpine AS server-deps
WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci --omit=dev

# ------------------------------------------------------------------------------
# Stage 3: Production Runtime
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production \
    PORT=5000

# Install curl for docker healthcheck
RUN apk add --no-cache curl tzdata

# Create dedicated non-root user for security
RUN addgroup -S nodejs -g 1001 && \
    adduser -S flashpass -u 1001 -G nodejs

# Copy root configurations
COPY package*.json ./
COPY ecosystem.config.cjs ./

# Copy backend dependencies and source code
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server ./server

# Copy compiled React frontend bundle to client/dist (served statically by Express)
COPY --from=client-builder /app/client/dist ./client/dist

# Ensure proper file permissions
RUN chown -R flashpass:nodejs /app

# Switch to non-root user
USER flashpass

# Expose unified API and Web interface port
EXPOSE 5000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsSL http://localhost:5000/api/v1/health || exit 1

# Start production server
CMD ["node", "server/src/server.js"]
