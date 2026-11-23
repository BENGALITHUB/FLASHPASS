#!/usr/bin/env bash
# ==============================================================================
# FlashPass - 1-Click AWS EC2 / Lightsail Server Initialization Script
# OS: Ubuntu 22.04 LTS / 24.04 LTS
# Installs: Node.js 20 LTS, Git, Nginx, Certbot (SSL), PM2, UFW Firewall
# ==============================================================================

set -euo pipefail

echo "========================================================"
echo "⚡ Starting FlashPass AWS EC2 Server Setup..."
echo "========================================================"

# 1. Update OS Packages
echo "🔄 Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# 2. Install essential build tools & dependencies
echo "📦 Installing core utilities (curl, git, ufw, build-essential)..."
sudo apt-get install -y curl git ufw software-properties-common ca-certificates gnupg build-essential

# 3. Install Node.js 20 LTS (NodeSource)
echo "🟢 Installing Node.js 20 LTS..."
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d'.' -f1)" != "v20" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "✅ Node version: $(node -v)"
echo "✅ NPM version: $(npm -v)"

# 4. Install PM2 Process Manager globally
echo "🚀 Installing PM2 globally..."
sudo npm install -g pm2
pm2 startup systemd -u "$USER" --hp "$HOME" | sudo bash || true

# 5. Install Nginx and Certbot for SSL
echo "🌐 Installing Nginx Web Server and Certbot..."
sudo apt-get install -y nginx certbot python3-certbot-nginx

# 6. Configure UFW Firewall
echo "🛡️ Configuring Firewall rules (SSH 22, HTTP 80, HTTPS 443)..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status verbose

# 7. Create Deployment Directory
DEPLOY_DIR="/var/www/flashpass"
echo "📁 Setting up deployment directory at $DEPLOY_DIR..."
sudo mkdir -p "$DEPLOY_DIR"
sudo chown -R "$USER":"$USER" "$DEPLOY_DIR"

# 8. Setup Nginx Configuration
echo "⚙️ Configuring Nginx reverse proxy..."
if [ -f "$DEPLOY_DIR/deploy/nginx.conf" ]; then
    sudo cp "$DEPLOY_DIR/deploy/nginx.conf" /etc/nginx/sites-available/flashpass
    sudo ln -sf /etc/nginx/sites-available/flashpass /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t
    sudo systemctl restart nginx
fi

echo "========================================================"
echo "🎉 Server Setup Completed Successfully!"
echo "========================================================"
echo "Next Steps:"
echo "1. Put your production secrets in: $DEPLOY_DIR/server/.env"
echo "2. Run 'sudo certbot --nginx -d yourdomain.com' for Free HTTPS SSL"
echo "3. Add AWS_HOST, AWS_USERNAME, AWS_SSH_KEY in your GitHub Secrets"
echo "========================================================"
