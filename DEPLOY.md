# CET Listening Studio 一键发布

## 首次准备

1. 确认可以运行 `ssh cet-listening-server`。
2. 使用项目专用 SSH 密钥，日常发布不输入登录密码。
3. 首次初始化服务器目录后，日常发布不需要 `sudo`。
4. 双击项目根目录的 `一键发布.bat`。

也可以在 `app` 目录运行标准发布命令：

```powershell
pnpm run deploy
```

发布程序会自动构建、校验、打包、上传、备份旧版本、切换版本，并核对线上 `index.html` 与本次构建的 SHA-256。最后同时检查服务器内部 HTTPS 和绕过本机代理的公网 HTTPS。发布包明确排除 `dist/data/audio`，不会覆盖服务器音频。

服务器仅需执行一次：

```bash
sudo apt install -y unzip
sudo mkdir -p /var/www/cet-listening /var/www/backups
sudo chown -R ubuntu:www-data /var/www/cet-listening /var/www/backups
sudo find /var/www/cet-listening -type d -exec chmod 755 {} +
sudo find /var/www/cet-listening -type f -exec chmod 644 {} +
```

Nginx 不需要在每次更新静态文件后重载，因此日常发布无需 `sudo`。

## HTTPS 首次配置

先将 `scripts/nginx-listening.website.conf` 放到服务器：

```bash
sudo cp nginx-listening.website.conf /etc/nginx/sites-available/listening.website
sudo ln -s /etc/nginx/sites-available/listening.website /etc/nginx/sites-enabled/listening.website
sudo nginx -t
sudo systemctl reload nginx
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d listening.website -d www.listening.website
sudo certbot renew --dry-run
```

同时确认腾讯云安全组放行 TCP 80 和 443。

## 回滚

服务器备份目录为 `/var/www/backups/cet-listening-时间戳`。确定目标备份名称后运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\rollback.ps1 -BackupName cet-listening-20260815-203000
```

## Clash

推荐使用规则模式。如果需要全局模式，将以下规则放在通用代理规则之前：

```yaml
- DOMAIN,listening.website,DIRECT
- DOMAIN,www.listening.website,DIRECT
- IP-CIDR,101.43.10.196/32,DIRECT,no-resolve
```
