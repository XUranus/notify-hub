---
sidebar_position: 8
title: VPS 部署
description: 在 VPS 上使用 Node.js、pm2 和 nginx 部署 NotifyHub。
---

# VPS 部署

在 Linux VPS（Ubuntu 22.04 / Debian 12）上使用 Node.js、pm2 和 nginx 部署 NotifyHub。

## 前置要求

- 运行 Ubuntu 22.04+ 或 Debian 12+ 的 VPS（最低 1 GB 内存）
- 域名已解析到 VPS 的 IP 地址
- Root 或 sudo 权限
- 80 和 443 端口已开放

## 步骤一：安装 Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # v20.x.x
```

## 步骤二：安装 pnpm 并克隆

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

## 步骤三：配置环境

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
请为 `JWT_SECRET` 和 `ENCRYPTION_KEY` 生成高强度的随机字符串。生产环境中切勿使用默认值。
:::

## 步骤四：使用 pm2 启动

```bash
sudo npm install -g pm2

cd /opt/notifyhub
pm2 start server/dist/index.js --name "notifyhub"

pm2 save
pm2 startup systemd
# Run the command pm2 outputs
```

### 常用 pm2 命令

| 命令 | 说明 |
|---|---|
| `pm2 status` | 进程状态 |
| `pm2 logs notifyhub` | 实时日志 |
| `pm2 restart notifyhub` | 重启 |
| `pm2 stop notifyhub` | 停止 |
| `pm2 monit` | 实时监控面板 |

## 步骤五：Nginx 反向代理

```bash
sudo apt-get install -y nginx
```

创建 `/etc/nginx/sites-available/notifyhub`：

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
}
```

启用并重启：

```bash
sudo ln -s /etc/nginx/sites-available/notifyhub /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

## 步骤六：使用 Let's Encrypt 配置 SSL

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d notifyhub.yourdomain.com
sudo certbot renew --dry-run  # verify auto-renewal
```

现在可以通过 `https://notifyhub.yourdomain.com` 访问你的站点。

## Systemd 替代方案

如果你更喜欢使用 systemd 而非 pm2：

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
请只选择 pm2 或 systemd 其中一种方式，不要同时使用。
:::

## 备份策略

SQLite 是单文件数据库，备份非常简单。

### 手动备份

```bash
cp /opt/notifyhub/data/notify-hub.db /opt/notifyhub/backups/backup-$(date +%Y%m%d).db
```

### 使用 cron 自动备份

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

## 监控

### 日志

```bash
# pm2
pm2 logs notifyhub --lines 200

# systemd
sudo journalctl -u notifyhub -f
```

### 健康检查

```bash
curl http://127.0.0.1:9527/health
```

建议配置外部监控服务（如 UptimeRobot、Healthchecks.io）以便在服务中断时收到告警。

## 防火墙

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

:::caution
切勿直接暴露 9527 端口。务必通过 nginx 进行路由。
:::
