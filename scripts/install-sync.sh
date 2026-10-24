#!/usr/bin/env bash
set -euo pipefail
package=/tmp/listening-sync-release
install -d -m 755 /opt/listening-sync
install -d -o www-data -g www-data -m 700 /var/lib/listening-sync
install -d -m 700 /var/backups/listening-sync
if [ -f /var/lib/listening-sync/progress.sqlite ]; then
  python3 /opt/listening-sync/backup_sync.py
fi
install -m 644 "$package/learning_sync.py" "$package/backup_sync.py" /opt/listening-sync/
install -m 600 "$package/sync.env" /etc/listening-sync.env
install -m 644 "$package/listening-sync.service" "$package/listening-sync-backup.service" "$package/listening-sync-backup.timer" /etc/systemd/system/
python3 - <<'PY'
from pathlib import Path
import datetime
p = Path('/etc/nginx/sites-available/cet-listening')
s = p.read_text()
if 'location = /api/learning-sync' not in s:
    backup = Path('/var/backups/listening-sync/nginx-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.conf')
    backup.write_text(s)
    marker = '    location / {'
    if marker not in s:
        raise RuntimeError('Expected site configuration not found')
    s = s.replace(marker, '''    location = /api/learning-sync {
        proxy_pass http://127.0.0.1:3197;
        proxy_read_timeout 40s;
        client_max_body_size 8m;
        access_log off;
        add_header Cache-Control "no-store" always;
        limit_except POST { deny all; }
    }

''' + marker, 1)
    p.write_text(s)
PY
nginx -t
systemctl daemon-reload
systemctl enable --now listening-sync.service listening-sync-backup.timer
systemctl restart listening-sync.service
systemctl reload nginx
systemctl is-active --quiet listening-sync.service
echo 'Account sync service installed; private storage remains outside static releases.'
