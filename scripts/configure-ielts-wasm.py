"""Set the app's WASM response type, with config validation and rollback."""
from datetime import datetime
from pathlib import Path
import shutil
import subprocess
import os

if os.geteuid() != 0:
    raise SystemExit('Nginx configuration requires the existing sudo permission; no files changed')

target = Path('/etc/nginx/sites-available/cet-listening')
text = target.read_text(encoding='utf-8')
marker = '    # IELTS SQLite WASM\n'
if marker not in text:
    anchor = '    location /assets/ {\n'
    if text.count(anchor) != 1:
        raise SystemExit('Unexpected app Nginx config; no files changed')
    block = (marker + '    location ~* ^/assets/.*\\.wasm$ {\n'
             '        types { application/wasm wasm; }\n'
             '        try_files $uri =404;\n'
             '        expires 1y;\n'
             '        add_header Cache-Control "public, immutable";\n'
             '    }\n\n')
    backup = Path('/var/www/backups') / f'cet-listening-nginx-{datetime.now():%Y%m%d-%H%M%S}.conf'
    shutil.copy2(target, backup)
    try:
        target.write_text(text.replace(anchor, block + anchor), encoding='utf-8')
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    except Exception:
        shutil.copy2(backup, target)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        raise
    print(f'Config backup: {backup}')
else:
    subprocess.run(['nginx', '-t'], check=True)
print('WASM MIME configured')
