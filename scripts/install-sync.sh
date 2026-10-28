#!/usr/bin/env bash
set -euo pipefail
package=/tmp/listening-sync-release
install -d -m 755 /opt/listening-sync
install -d -o www-data -g www-data -m 700 /var/lib/listening-sync
install -d -o www-data -g www-data -m 700 /var/lib/listening-sync/jiufen-audio
install -d -o www-data -g www-data -m 700 /var/lib/listening-sync/cambridge-audio
install -d -o www-data -g www-data -m 700 /var/lib/listening-sync/ielts-cards
install -d -m 700 /var/backups/listening-sync
if [ -f /var/lib/listening-sync/progress.sqlite ]; then
  python3 /opt/listening-sync/backup_sync.py
fi
install -m 644 "$package/learning_sync.py" "$package/jiufen_sync.py" "$package/jiufen_audio_cache.py" "$package/cambridge_library.py" "$package/ielts_cards.py" "$package/backup_sync.py" /opt/listening-sync/
if [ -f "$package/ielts-cards-manifest.json" ]; then
  ielts_base=/var/lib/listening-sync/ielts-cards
  if [ -f "$package/ielts-cards-audio.tar" ]; then
    release="$ielts_base/releases/$(date -u +%Y%m%dT%H%M%SZ)-$$"
    install -d -o www-data -g www-data -m 700 "$ielts_base/releases" "$release" "$release/audio"
    install -o www-data -g www-data -m 600 "$package/ielts-cards-manifest.json" "$release/manifest.json"
    if tar -tf "$package/ielts-cards-audio.tar" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
      echo 'Unsafe path in IELTS audio archive' >&2
      exit 1
    fi
    tar -xf "$package/ielts-cards-audio.tar" -C "$release/audio" --no-same-owner
    chown -R www-data:www-data "$release"
    find "$release" -type d -exec chmod 700 {} +
    find "$release" -type f -exec chmod 600 {} +
    manifest_to_verify="$release/manifest.json"
    audio_root="$release/audio"
  else
    current_release="$(readlink -f "$ielts_base/current")"
    case "$current_release" in "$ielts_base"/releases/*) ;; *) echo 'No valid current IELTS audio release for manifest-only update' >&2; exit 1 ;; esac
    test -d "$current_release/audio"
    release="$current_release"
    manifest_to_verify="$release/.manifest-$$.json"
    install -o www-data -g www-data -m 600 "$package/ielts-cards-manifest.json" "$manifest_to_verify"
    audio_root="$release/audio"
  fi
  python3 - "$manifest_to_verify" "$audio_root" <<'PY'
import hashlib, json, re, sys
from pathlib import Path
manifest_path, audio_root = Path(sys.argv[1]), Path(sys.argv[2])
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
articles = manifest.get('articles', [])
if manifest.get('schemaVersion') != 1 or len(articles) != 40:
    raise SystemExit('IELTS card catalog must contain exactly 40 articles')
expected = set()
for article in articles:
    article_id = article.get('id', '')
    name = article.get('audioFile', '')
    if not re.fullmatch(r'p[1-4]-a(?:0[1-9]|10)', article_id) or name != article_id + '.mp3':
        raise SystemExit('Invalid IELTS article audio name')
    ids = set()
    for sentence in article.get('sentences', []):
        source_index = sentence.get('sourceIndex')
        if (type(source_index) is not int or source_index < 1 or source_index > 999
                or sentence.get('id') != f'{article_id}-s{source_index:03d}'
                or sentence.get('id') in ids or not isinstance(sentence.get('english'), str) or not sentence['english'].strip()
                or not isinstance(sentence.get('chinese'), str) or not sentence['chinese'].strip()
                or type(sentence.get('start')) not in (int, float) or type(sentence.get('end')) not in (int, float)
                or sentence['start'] < 0 or sentence['end'] <= sentence['start']):
            raise SystemExit(f'Invalid IELTS sentence card: {article_id}')
        ids.add(sentence['id'])
    if not ids:
        raise SystemExit(f'IELTS article has no sentence cards: {article_id}')
    path = audio_root / name
    if not path.is_file() or path.stat().st_size != article.get('audioBytes'):
        raise SystemExit(f'IELTS audio size mismatch: {name}')
    digest = hashlib.sha256()
    with path.open('rb') as audio:
        for chunk in iter(lambda: audio.read(1024 * 1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != article.get('audioSha256'):
        raise SystemExit(f'IELTS audio checksum mismatch: {name}')
    expected.add(name)
actual = {path.name for path in audio_root.glob('*.mp3')}
if actual != expected or len(actual) != 40:
    raise SystemExit('IELTS audio archive does not match the 40-article catalog')
print('Verified IELTS private library: 40 audio tracks')
PY
  if [ -f "$package/ielts-cards-audio.tar" ]; then
    current_tmp="$ielts_base/.current-$$"
    ln -s "$release" "$current_tmp"
    mv -Tf "$current_tmp" "$ielts_base/current"
    rm -- "$package/ielts-cards-manifest.json" "$package/ielts-cards-audio.tar"
  else
    mv -f "$manifest_to_verify" "$release/manifest.json"
    chown www-data:www-data "$release/manifest.json"
    chmod 600 "$release/manifest.json"
    rm -- "$package/ielts-cards-manifest.json"
    echo 'Updated IELTS sentence catalog; existing audio files were reused without upload.'
  fi
elif [ -f "$package/ielts-cards-audio.tar" ]; then
  echo 'IELTS audio archive exists without its catalog' >&2
  exit 1
fi
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
if 'location ^~ /api/jiufen/' not in s:
    backup = Path('/var/backups/listening-sync/nginx-jiufen-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.conf')
    backup.write_text(s)
    marker = '    location / {'
    if marker not in s:
        raise RuntimeError('Expected site configuration not found')
    s = s.replace(marker, '''    location ^~ /api/jiufen/ {
        proxy_set_header X-Listening-Client-IP $remote_addr;
        proxy_pass http://127.0.0.1:3197;
        proxy_read_timeout 40s;
        client_max_body_size 8m;
        access_log off;
        add_header Cache-Control "no-store" always;
        limit_except POST { deny all; }
    }

''' + marker, 1)
    p.write_text(s)
# Private media uses short-lived per-card tickets. Never write its query string to nginx logs.
if 'location ^~ /api/jiufen/media/' not in s:
    backup = Path('/var/backups/listening-sync/nginx-jiufen-audio-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.conf')
    backup.write_text(s)
    marker = '    location ^~ /api/jiufen/ {' if '    location ^~ /api/jiufen/ {' in s else '    location / {'
    if marker not in s:
        raise RuntimeError('Expected Jiufen or site location not found')
    s = s.replace(marker, '''    location ^~ /api/jiufen/media/ {
        proxy_pass http://127.0.0.1:3197;
        proxy_read_timeout 60s;
        proxy_buffering off;
        proxy_request_buffering off;
        access_log off;
        add_header Cache-Control "private, no-store" always;
        limit_except GET HEAD { deny all; }
    }

''' + marker, 1)
    p.write_text(s)
# Cambridge audio is private and served only with short-lived owner-bound tickets.
if 'location ^~ /api/cambridge/' not in s:
    backup = Path('/var/backups/listening-sync/nginx-cambridge-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.conf')
    backup.write_text(s)
    marker = '    location ^~ /api/jiufen/media/' if '    location ^~ /api/jiufen/media/' in s else '    location / {'
    if marker not in s:
        raise RuntimeError('Expected API or site location not found')
    s = s.replace(marker, '''    location ^~ /api/cambridge/ {
        proxy_set_header X-Listening-Client-IP $remote_addr;
        proxy_pass http://127.0.0.1:3197;
        proxy_read_timeout 60s;
        proxy_buffering off;
        proxy_request_buffering off;
        client_max_body_size 8k;
        access_log off;
        add_header Cache-Control "private, no-store" always;
        limit_except GET HEAD POST { deny all; }
    }

''' + marker, 1)
    p.write_text(s)
if 'location ^~ /api/ielts/cards/' not in s:
    backup = Path('/var/backups/listening-sync/nginx-ielts-cards-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.conf')
    backup.write_text(s)
    marker = '    location / {'
    if marker not in s:
        raise RuntimeError('Expected site location not found')
    s = s.replace(marker, '''    location ^~ /api/ielts/cards/ {
        proxy_pass http://127.0.0.1:3197;
        proxy_read_timeout 60s;
        proxy_buffering off;
        client_max_body_size 8k;
        access_log off;
        add_header Cache-Control "private, no-store" always;
        limit_except POST { deny all; }
    }

''' + marker, 1)
    p.write_text(s)
# IELTS sentence-card media is owner-ticketed and uses byte ranges for timed playback.
if 'location ^~ /api/ielts/cards/media/' not in s:
    backup = Path('/var/backups/listening-sync/nginx-ielts-media-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.conf')
    backup.write_text(s)
    marker = '    location ^~ /api/ielts/cards/ {' if '    location ^~ /api/ielts/cards/ {' in s else '    location / {'
    if marker not in s:
        raise RuntimeError('Expected IELTS API or site location not found')
    media_location = '''    location ^~ /api/ielts/cards/media/ {
        proxy_pass http://127.0.0.1:3197;
        proxy_read_timeout 60s;
        proxy_buffering off;
        proxy_request_buffering off;
        access_log off;
        add_header Cache-Control "private, no-store" always;
        limit_except GET HEAD { deny all; }
    }

'''
    s = s.replace(marker, media_location + marker, 1)
    p.write_text(s)
# Upgrade pre-existing Jiufen routes to the overwritten trusted peer header too.
route_marker = '    location ^~ /api/jiufen/ {\n'
trusted_header = '        proxy_set_header X-Listening-Client-IP $remote_addr;\n'
if route_marker in s and route_marker + trusted_header not in s:
    s = s.replace(route_marker, route_marker + trusted_header, 1)
    p.write_text(s)
if 'location ^~ /assets/jiufen/' not in s:
    backup = Path('/var/backups/listening-sync/nginx-jiufen-mime-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.conf')
    backup.write_text(s)
    marker = '    location /assets/ {' if '    location /assets/ {' in s else '    location / {'
    if marker not in s:
        raise RuntimeError('Expected static location not found')
    s = s.replace(marker, '''    location ^~ /assets/jiufen/ {
        types { text/javascript mjs; }
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
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
