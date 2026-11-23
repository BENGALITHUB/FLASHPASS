# 🚀 FlashPass - AWS Production Deployment Guide

This guide walks you through deploying FlashPass on **AWS EC2** (or AWS Lightsail) with automated **GitHub Actions CI/CD**, **Nginx Reverse Proxy**, **PM2 Process Management**, and **Free Let's Encrypt SSL**.

---

## 📋 Architecture Overview

- **Port 80/443 (Internet)** ➡️ **Nginx** (SSL Termination + HTTP/WebSocket Reverse Proxy + Static Asset Caching)
- **Port 5000 (Internal)** ➡️ **Node.js Express + Socket.io Server** (Managed by PM2 / Docker)
- **Frontend SPA** ➡️ Built by Vite (`client/dist`) and served unified by Express static server
- **Database** ➡️ MongoDB Atlas Cloud Cluster
- **CI/CD** ➡️ GitHub Actions automatically tests, builds, and deploys every push to `main` via SSH

---

## 🛠️ Step 1: Launch an AWS EC2 Instance

1. Log into your **AWS Console** ➡️ Go to **EC2** ➡️ Click **Launch Instance**.
2. **Instance Details:**
   - **Name:** `FlashPass-Production`
   - **OS / AMI:** **Ubuntu 22.04 LTS** or **Ubuntu 24.04 LTS** (64-bit x86)
   - **Instance Type:** `t3.small` or `t3.medium` (minimum 1GB RAM; 2GB recommended for building Vite frontend)
   - **Key pair:** Create or select an existing `.pem` key pair (e.g., `flashpass-key.pem`). Save this safely on your computer!
3. **Network & Security Groups (Firewall):**
   - Ensure the following inbound rules are **Allowed**:
     | Type | Port Range | Source | Purpose |
     |---|---|---|---|
     | **SSH** | `22` | Anywhere (`0.0.0.0/0`) or Your IP | SSH access & GitHub Actions |
     | **HTTP** | `80` | Anywhere (`0.0.0.0/0`) | Public web traffic & SSL renewal |
     | **HTTPS** | `443` | Anywhere (`0.0.0.0/0`) | Secure production web traffic |
4. **Storage:** 20 GB gp3 SSD.
5. Click **Launch Instance** and attach an **Elastic IP** (static IP) to the instance so the IP never changes on reboot.

---

## ⚡ Step 2: One-Click Server Initialization

1. Connect to your EC2 instance via SSH:
   ```bash
   ssh -i /path/to/flashpass-key.pem ubuntu@<YOUR-EC2-PUBLIC-IP>
   ```

2. Download and run the one-click initialization script:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>/main/deploy/setup-aws-ec2.sh -o setup-aws-ec2.sh
   chmod +x setup-aws-ec2.sh
   ./setup-aws-ec2.sh
   ```
   *(Or clone the repository directly to `/var/www/flashpass` and run `./deploy/setup-aws-ec2.sh`)*

3. Configure your production environment variables:
   ```bash
   nano /var/www/flashpass/server/.env
   ```
   Paste your MongoDB Atlas connection string, QR HMAC secret, JWT secret, and payment gateway keys:
   ```env
   PORT=5000
   NODE_ENV=production
   CLIENT_URL=https://yourdomain.com
   MONGODB_URI=mongodb+srv://admin:password@cluster0.xxxxx.mongodb.net/comics-carnival?retryWrites=true&w=majority
   QR_HMAC_SECRET=your_32_char_random_secret_here
   QR_KEY_VERSION=CC1
   JWT_SECRET=your_32_char_jwt_secret_here
   DEFAULT_ADMIN_PIN=1234
   TRUST_PROXY=1
   ```

4. Configure Nginx reverse proxy:
   ```bash
   sudo cp /var/www/flashpass/deploy/nginx.conf /etc/nginx/sites-available/flashpass
   sudo ln -sf /etc/nginx/sites-available/flashpass /etc/nginx/sites-enabled/
   sudo rm -f /etc/nginx/sites-enabled/default
   sudo nginx -t
   sudo systemctl restart nginx
   ```

5. Install Free SSL with Let's Encrypt (Optional but Recommended):
   ```bash
   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```

---

## 🔑 Step 3: Configure GitHub Secrets for Automatic CI/CD

In your GitHub repository, navigate to:
**Settings** ➡️ **Secrets and variables** ➡️ **Actions** ➡️ **New repository secret**.

Add the following 3 secrets:

| Secret Name | Description | Example Value |
|---|---|---|
| `AWS_HOST` | Your EC2 Public IPv4 or Elastic IP | `13.233.xx.xx` or `ticket.yourdomain.com` |
| `AWS_USERNAME` | Default username for the Ubuntu instance | `ubuntu` |
| `AWS_SSH_KEY` | The **entire contents** of your private `.pem` key file | `-----BEGIN RSA PRIVATE KEY----- ... -----END RSA PRIVATE KEY-----` |
| `AWS_PORT` *(Optional)* | SSH port (defaults to 22 if omitted) | `22` |

---

## 🔄 How the CI/CD Pipeline Works

Whenever you push code to `main`:
1. **GitHub Actions (`.github/workflows/deploy.yml`)** starts immediately.
2. **Build & Verify Job:**
   - Installs server and client dependencies on Ubuntu runner.
   - Compiles Vite React frontend into production bundle (`client/dist`).
   - Verifies bundle integrity.
3. **Deploy to AWS Job:**
   - Connects securely to your EC2 instance via SSH.
   - Pulls the latest commits.
   - Builds frontend & installs backend packages on the server.
   - Reloads PM2 (`pm2 reload ecosystem.config.cjs --update-env`) with **zero downtime**.
   - Performs a curl health check (`/api/v1/health`) to ensure your site is alive.

---

## 🐳 Alternative: Running with Docker & Docker Compose

If you prefer containerized deployment:
```bash
# Build and run containers
docker-compose up -d --build

# View container logs
docker-compose logs -f

# Stop containers
docker-compose down
```
