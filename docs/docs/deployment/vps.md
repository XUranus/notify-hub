---
sidebar_position: 8
title: VPS Deployment
description: Deploy NotifyHub on a VPS with Node.js, pm2, and nginx.
---

# VPS Deployment

Deploy NotifyHub on a Linux VPS (Ubuntu 22.04 / Debian 12) with Node.js, pm2, and nginx.

## Prerequisites

- VPS with Ubuntu 22.04+ or Debian 12+ (min 1 GB RAM)
- Domain name pointed at your VPS IP
- Root or sudo access
- Ports 80 and 443 open

## Step 1: Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # v20.x.x
```

## Step 2: Install pnpm and Clone

```bash
# Install pnpm
corepack enable
corepack prepare pnpm@latest --activate

# Clone
sudo mkdir -p /opt/notifyhub
sudo chown $USER:$USER /opt/notifyhub
git clone https://github.com/notifyhub/notifyhub.git /opt/notifyhub
cd /opt/notifyhub

# Install and build
pnpm install
pnpm build
```

## Step 3: Configure Environment

```bash
cat > /opt/notifyhub/.env << 'EOF'
PORT=9527
HOST=127.0.0.1
DATABASE_URL=./data/notify-hub.db
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-to-a-strong-password
JWT_SECRET=$(openssl rand -base64 48)
ENCRYPTION_KEY=$(openssl rand -hex 16)
CORS_ORIGIN=https://notifyhub.yourdomain.com
EOF
```

:::warning
Generate strong random strings for `JWT_SECRET` and `ENCRYPTION_KEY`. Never use defaults in production.
:::

## Step 4: Start with pm2

```bash
sudo npm install -g pm2

cd /opt/notifyhub
pm2 start server/dist/index.js --name "notifyhub"

pm2 save
pm2 startup systemd
# Run the command pm2 outputs
```

### Useful pm2 Commands

| Command | Description |
|---|---|
| `pm2 status` | Process status |
| `pm2 logs notifyhub` | Live logs |
| `pm2 restart notifyhub` | Restart |
| `pm2 stop notifyhub` | Stop |
| `pm2 monit` | Real-time dashboard |

## Step 5: Nginx Reverse Proxy

```bash
sudo apt-get install -y nginx
```

Create `/etc/nginx/sites-available/notifyhub`:

```nginx
server {
    listen 80;
    server_name notifyhub.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:9527;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 10m;
    }

    # Uploaded files (images, PDFs, etc.)
    location /uploads/ {
        proxy_pass http://127.0.0.1:9527;
        proxy_set_header Host $host;
        proxy_cache_valid 200 1d;
    }
}
```

Enable and restart:

```bash
sudo ln -s /etc/nginx/sites-available/notifyhub /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

## Step 6: SSL with Let's Encrypt

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d notifyhub.yourdomain.com
sudo certbot renew --dry-run  # verify auto-renewal
```

Your site is now at `https://notifyhub.yourdomain.com`.

## Systemd Alternative

If you prefer systemd over pm2:

```ini
# /etc/systemd/system/notifyhub.service
[Unit]
Description=NotifyHub Notification Service
After=network.target

[Service]
Type=simple
User=notifyhub
WorkingDirectory=/opt/notifyhub
ExecStart=/usr/bin/node server/dist/index.js
Restart=on-failure
RestartSec=10
EnvironmentFile=/opt/notifyhub/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable notifyhub
sudo systemctl start notifyhub
```

:::note
Use either pm2 or systemd, not both.
:::

## Backup Strategy

SQLite is a single file — backups are simple.

### Manual

```bash
cp /opt/notifyhub/data/notify-hub.db /opt/notifyhub/backups/backup-$(date +%Y%m%d).db
```

### Automated with cron

```bash
mkdir -p /opt/notifyhub/backups
```

```bash
# /opt/notifyhub/backup.sh
#!/bin/bash
sqlite3 /opt/notifyhub/data/notify-hub.db \
  ".backup /opt/notifyhub/backups/backup-$(date +%Y%m%d-%H%M%S).db"
# Keep last 30 backups
ls -t /opt/notifyhub/backups/backup-*.db | tail -n +31 | xargs -r rm
```

```cron
0 3 * * * /opt/notifyhub/backup.sh
```

## Monitoring

### Logs

```bash
# pm2
pm2 logs notifyhub --lines 200

# systemd
sudo journalctl -u notifyhub -f
```

### Health Check

```bash
curl http://127.0.0.1:9527/health
```

Set up external monitoring (UptimeRobot, Healthchecks.io) to alert on downtime.

## Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

:::caution
Never expose port 9527 directly. Always route through nginx.
:::
