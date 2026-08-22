#!/usr/bin/env bash
set -Eeuo pipefail

site_root="${1:?missing site root}"
release_zip="${2:?missing release zip}"
timestamp="$(date +%Y%m%d-%H%M%S)"
backup_root="/var/www/backups"
backup_path="${backup_root}/cet-listening-${timestamp}"
stage_path="/tmp/cet-listening-stage-${timestamp}"

case "$site_root" in
  /var/www/cet-listening) ;;
  *) echo "Refusing unexpected site root: $site_root" >&2; exit 2 ;;
esac

test -f "$release_zip"
mkdir -p "$backup_root" "$stage_path"
unzip_status=0
unzip -q "$release_zip" -d "$stage_path" || unzip_status=$?
if test "$unzip_status" -gt 1; then
  echo "Unzip failed with exit code $unzip_status" >&2
  exit "$unzip_status"
fi
test -f "$stage_path/index.html"
test -d "$stage_path/assets"

mkdir -p "$backup_path"
for item in index.html assets sw.js manifest.webmanifest registerSW.js; do
  if test -e "$site_root/$item"; then
    cp -a "$site_root/$item" "$backup_path/"
  fi
done

rm -rf "$site_root/assets"
cp -a "$stage_path/assets" "$site_root/assets"
for item in index.html sw.js manifest.webmanifest registerSW.js; do
  if test -f "$stage_path/$item"; then
    install -m 0644 "$stage_path/$item" "$site_root/$item"
  fi
done
if test -d "$stage_path/data"; then
  mkdir -p "$site_root/data"
  cp -a "$stage_path/data/." "$site_root/data/"
fi

find "$site_root" -type d -exec chmod 755 {} +
find "$site_root" -type f -exec chmod 644 {} +
rm -rf "$stage_path" "$release_zip"
echo "Backup: $backup_path"
