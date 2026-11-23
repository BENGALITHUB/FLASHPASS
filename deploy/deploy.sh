#!/usr/bin/env bash
# ==============================================================================
# FlashPass - Local Deploy & Update Script for Server
# ==============================================================================

set -euo pipefail

ROOT_DIR="/var/www/flashpass"
cd "$ROOT_DIR"

echo "========================================================"
echo "🚀 Deploying Latest FlashPass Release..."
echo "========================================================"

# 1. Pull latest code
echo "📥 Pulling latest commits from GitHub..."
git fetch origin main
git reset --hard origin/main

# 2. Install backend dependencies
echo "📦 Installing server production dependencies..."
cd "$ROOT_DIR/server"
npm ci --omit=dev

# 3. Build React frontend bundle
echo "🏗️ Building client production assets..."
cd "$ROOT_DIR/client"
npm ci
npm run build

cd "$ROOT_DIR"

# 4. Check .env file
if [ ! -f "server/.env" ]; then
    echo "⚠️ Warning: server/.env does not exist! Please create it before starting."
fi

# 5. Reload PM2
echo "🔄 Reloading PM2 process..."
pm2 reload ecosystem.config.cjs --update-env || pm2 start ecosystem.config.cjs
pm2 save

# 6. Verify Health
echo "🩺 Verifying application health..."
sleep 3
if curl -fsSL http://127.0.0.1:5000/api/v1/health >/dev/null; then
    echo "========================================================"
    echo "✅ FlashPass deployed and running smoothly on port 5000!"
    echo "========================================================"
else
    echo "❌ Health check failed. Inspecting PM2 logs..."
    pm2 logs flashpass --lines 25 --nostream
    exit 1
fi
