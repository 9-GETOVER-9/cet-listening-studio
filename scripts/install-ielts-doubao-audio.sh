#!/usr/bin/env bash
set -Eeuo pipefail
stage="${1:?missing staging path}"
expected="${2:?missing archive sha256}"
case "$stage" in /tmp/ielts-doubao-*) ;; *) exit 2 ;; esac
[[ "$expected" =~ ^[0-9a-f]{64}$ ]]
cat "$stage"/part-{0..7} > "$stage/audio.tar"
printf '%s  %s\n' "$expected" "$stage/audio.tar" | sha256sum --check --status
tar --no-same-owner --no-same-permissions -xf "$stage/audio.tar" -C /var/www/cet-listening
cd /var/www/cet-listening
sha256sum --check --status "$stage/audio.sha256"
echo "Audio archive and all 200 files verified."
