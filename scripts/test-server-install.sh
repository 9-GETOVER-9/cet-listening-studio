#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/server-install.sh"

fixture="$(mktemp -d)"
trap 'rm -rf -- "$fixture"' EXIT
site="$fixture/site"
stage="$fixture/stage"
backup="$fixture/backup"
work="$fixture/work"
mkdir -p "$site/assets" "$site/data/audio" "$stage/assets" "$stage/data" "$work"
printf 'old-index' > "$site/index.html"
printf 'old-asset' > "$site/assets/old.js"
printf 'old-sw' > "$site/sw.js"
printf 'old-workbox' > "$site/workbox-old.js"
printf '{"version":"old"}' > "$site/data/corpus.json"
dd if=/dev/zero of="$site/data/audio/voice.mp3" bs=1024 count=128 status=none
audio_checksum="$(cksum < "$site/data/audio/voice.mp3")"
printf 'new-index' > "$stage/index.html"
printf 'new-sw' > "$stage/sw.js"
printf 'new-asset' > "$stage/assets/new.js"
printf '{"version":"new"}' > "$stage/data/corpus.json"

fail() { echo "FAIL: $*" >&2; exit 1; }
assert_content() { test "$(cat "$1")" = "$2" || fail "contents of $1"; }
make_zip() {
  if [[ "${CET_TEST_FORCE_PYTHON_ZIP:-0}" != 1 ]] && command -v zip >/dev/null 2>&1; then
    command zip -q "$@"
  else
    "${CET_TEST_PYTHON:-python3}" - "$@" <<'PY'
import sys
import zipfile

with zipfile.ZipFile(sys.argv[1], "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for path in sys.argv[2:]:
        archive.write(path, arcname=path)
PY
  fi
}
validate_stage "$stage"
for optional in sw.js manifest.webmanifest registerSW.js workbox-invalid.js; do
  if [[ -f "$stage/$optional" ]]; then mv "$stage/$optional" "$fixture/stage-optional.saved"; fi
  mkdir "$stage/$optional"
  if validate_stage "$stage"; then fail "stage accepted directory at $optional"; fi
  rmdir "$stage/$optional"
  if [[ -f "$fixture/stage-optional.saved" ]]; then mv "$fixture/stage-optional.saved" "$stage/$optional"; fi
done
for optional in sw.js manifest.webmanifest registerSW.js workbox-invalid.js; do
  if [[ -f "$site/$optional" ]]; then mv "$site/$optional" "$fixture/optional.saved"; fi
  mkdir "$site/$optional"
  if validate_live "$site"; then fail "live accepted directory at $optional"; fi
  rmdir "$site/$optional"
  if [[ -f "$fixture/optional.saved" ]]; then mv "$fixture/optional.saved" "$site/$optional"; fi
done
backup_site "$site" "$backup"
assert_content "$backup/data/corpus.json" '{"version":"old"}'
test ! "$site/data/corpus.json" -ef "$backup/data/corpus.json" || fail 'JSON must be independently copied'
if [[ "$(uname -s)" == Linux* ]]; then
  test "$site/data/audio/voice.mp3" -ef "$backup/data/audio/voice.mp3" || fail 'audio inode must be shared'
  separate=$(du -sk "$site/data/audio" | awk '{print $1}')
  combined=$(du -sk "$site/data/audio" "$backup/data/audio" | awk '{sum += $1} END {print sum}')
  test "$combined" -le "$((separate + 8))" || fail 'audio blocks must not be duplicated'
else
  echo 'NOTE: Git Bash fixture cannot establish Linux inode/block guarantees; repeat on Linux.'
fi
eval "$(declare -f atomic_copy | sed '1s/atomic_copy/original_atomic_copy/')"
atomic_copy() {
  if [[ "$2" == "$site/sw.js" ]]; then
    assert_content "$site/index.html" new-index
  fi
  original_atomic_copy "$@"
}
deploy_release "$site" "$stage" "$backup" "$work"
assert_content "$site/index.html" new-index
assert_content "$site/sw.js" new-sw
assert_content "$site/data/corpus.json" '{"version":"new"}'
assert_content "$backup/data/corpus.json" '{"version":"old"}'
assert_content "$site/assets/old.js" old-asset
assert_content "$site/assets/new.js" new-asset
assert_content "$backup/sw.js" old-sw
assert_content "$backup/workbox-old.js" old-workbox

mkdir "$stage/data/audio"
if validate_stage "$stage"; then fail 'incoming audio accepted'; fi
rmdir "$stage/data/audio"
mv "$stage/index.html" "$stage/index.saved"
if validate_stage "$stage"; then fail 'invalid stage accepted'; fi
mv "$stage/index.saved" "$stage/index.html"
if assert_space 100 99 fixture; then fail 'insufficient disk accepted'; fi
assert_space 100 100 fixture
test "$(release_required_kib 10 100 5 3 64)" = 197 || fail 'space bound must cover backup, incoming writes, two asset scratch copies and core restore temp'
if validate_site_root /var/www/cet-listening/other; then fail 'unexpected site root accepted'; fi
if deploy_release "$site" "$stage" "$fixture/missing-backup" "$work"; then fail 'missing backup accepted'; fi
assert_content "$site/index.html" new-index
assert_content "$site/data/corpus.json" '{"version":"new"}'

failed_backup="$fixture/failed-backup"
cp() {
  if [[ "${@: -1}" == "$failed_backup/" ]]; then return 1; fi
  command cp "$@"
}
if backup_site "$site" "$failed_backup"; then fail 'injected backup-copy failure accepted'; fi
unset -f cp
test ! -e "$failed_backup/.complete" || fail 'failed backup marked complete'
assert_content "$site/index.html" new-index
assert_content "$site/data/corpus.json" '{"version":"new"}'
assert_content "$site/assets/new.js" new-asset
test "$(cksum < "$site/data/audio/voice.mp3")" = "$audio_checksum" || fail 'audio changed on backup failure'

# Archive checks run before extraction, including PowerShell's Windows paths.
(cd "$stage" && make_zip "$fixture/valid.zip" index.html assets/new.js data/corpus.json)
validate_archive "$fixture/valid.zip"
# Three tiny files total less than 1 KiB: 1 KiB payload + 3 * 8 KiB
# entry allowance. The unzip summary row is not a fourth archive entry.
test "$(archive_expanded_kib "$fixture/valid.zip")" = 25 || fail 'archive estimate counted summary bytes or entries'
mkdir "$stage/data/audio"
printf audio > "$stage/data/audio/incoming.mp3"
(cd "$stage" && make_zip "$fixture/media.zip" index.html data/audio/incoming.mp3)
if validate_archive "$fixture/media.zip"; then fail 'archive media accepted'; fi
rm -rf "$stage/data/audio"
printf outside > "$fixture/outside.txt"
(cd "$stage" && make_zip "$fixture/traversal.zip" ../outside.txt)
if validate_archive "$fixture/traversal.zip"; then fail 'archive traversal accepted'; fi
printf invalid > "$fixture/invalid.zip"
if validate_archive "$fixture/invalid.zip"; then fail 'corrupt archive accepted'; fi

# A file colliding with an existing directory must fail, never move copy.tmp
# inside that directory and report a successful release.
shape_site="$fixture/shape-site"
shape_backup="$fixture/shape-backup"
shape_work="$fixture/shape-work"
cp -a "$backup" "$shape_site"
rm "$shape_site/data/corpus.json"
mkdir "$shape_site/data/corpus.json" "$shape_work"
printf legacy > "$shape_site/data/corpus.json/legacy.json"
backup_site "$shape_site" "$shape_backup"
if deploy_release "$shape_site" "$stage" "$shape_backup" "$shape_work"; then fail 'directory accepted as incoming file destination'; fi
assert_content "$shape_site/index.html" old-index
assert_content "$shape_site/data/corpus.json/legacy.json" legacy
test ! -e "$shape_site/data/corpus.json/copy.tmp" || fail 'temporary file nested in original directory'
assert_content "$shape_site/assets/old.js" old-asset

# Fail before the assets rename so rollback must copy backup assets. Deliver
# TERM while that fallback scratch directory exists, as with an interrupted cp.
# The normal rollback must mask it so the outer interruption handler cannot
# recursively restore into the same scratch and publish assets/assets.
signal_site="$fixture/signal-site"
signal_work="$fixture/signal-work"
cp -a "$backup" "$signal_site"
mkdir "$signal_work"
signal_status=0
if (
  injected=0
  cp() {
    if [[ "${@: -1}" == "$signal_work/new-assets/" ]]; then return 1; fi
    command cp "$@" || return
    if [[ "${@: -1}" == "$signal_work/restored-assets" && "$injected" == 0 ]]; then
      injected=1
      kill -TERM "$BASHPID"
    fi
  }
  trap 'trap "" INT TERM; restore_backup "$signal_site" "$backup" "$signal_work"; exit 130' INT TERM
  deploy_release "$signal_site" "$stage" "$backup" "$signal_work"
); then
  fail 'injected pre-switch failure accepted'
else
  signal_status=$?
fi
test "$signal_status" = 1 || fail "signal interrupted rollback (status $signal_status)"
assert_content "$signal_site/index.html" old-index
assert_content "$signal_site/assets/old.js" old-asset
test ! -e "$signal_site/assets/assets" || fail 'fallback assets nested after signal'

# A failed fallback must return the distinct retention status, preserving its
# diagnostic work for main's keep_work=1 cleanup path and the complete backup.
rollback_failure_site="$fixture/rollback-failure-site"
rollback_failure_work="$fixture/rollback-failure-work"
cp -a "$backup" "$rollback_failure_site"
mkdir "$rollback_failure_work"
rollback_failure_status=0
if (
  cp() {
    if [[ "${@: -1}" == "$rollback_failure_work/new-assets/" ]]; then return 1; fi
    if [[ "${@: -1}" == "$rollback_failure_work/restored-assets" ]]; then
      mkdir "$rollback_failure_work/restored-assets"
      printf diagnostic > "$rollback_failure_work/restored-assets/partial"
      return 1
    fi
    command cp "$@"
  }
  deploy_release "$rollback_failure_site" "$stage" "$backup" "$rollback_failure_work"
); then fail 'failed rollback accepted'; else rollback_failure_status=$?; fi
test "$rollback_failure_status" = 2 || fail 'failed rollback did not request work retention'
assert_content "$rollback_failure_work/restored-assets/partial" diagnostic
assert_content "$rollback_failure_site/assets/old.js" old-asset
assert_content "$backup/assets/old.js" old-asset
test -f "$backup/.complete" || fail 'failed rollback damaged complete backup'

# Force a failure after the assets switch and after mutable JSON replacement.
mv() {
  if [[ "${@: -1}" == "$site/sw.js" ]]; then
    assert_content "$site/index.html" old-index
  fi
  command mv "$@"
}
restore_backup "$site" "$backup" "$work"
unset -f mv
rm -rf "$work"
mkdir "$work"
atomic_copy() {
  if [[ "$2" == "$site/index.html" ]]; then return 1; fi
  original_atomic_copy "$@"
}
if deploy_release "$site" "$stage" "$backup" "$work"; then fail 'injected failure accepted'; fi
assert_content "$site/index.html" old-index
assert_content "$site/data/corpus.json" '{"version":"old"}'
assert_content "$site/assets/old.js" old-asset
test ! -e "$site/assets/new.js" || fail 'rollback left new assets'
assert_content "$site/sw.js" old-sw
assert_content "$site/workbox-old.js" old-workbox
assert_content "$backup/data/corpus.json" '{"version":"old"}'
test "$(cksum < "$site/data/audio/voice.mp3")" = "$audio_checksum" || fail 'audio changed during rollback'

# Failure publishing the final service worker must undo the already-published
# entrypoint and mutable data, together with the resources installed before it.
sw_site="$fixture/sw-site"
sw_work="$fixture/sw-work"
cp -a "$backup" "$sw_site"
mkdir "$sw_work"
atomic_copy() {
  if [[ "$2" == "$sw_site/sw.js" ]]; then
    assert_content "$sw_site/index.html" new-index
    return 1
  fi
  original_atomic_copy "$@"
}
if deploy_release "$sw_site" "$stage" "$backup" "$sw_work"; then fail 'final SW publication failure accepted'; fi
assert_content "$sw_site/index.html" old-index
assert_content "$sw_site/sw.js" old-sw
assert_content "$sw_site/data/corpus.json" '{"version":"old"}'
assert_content "$sw_site/assets/old.js" old-asset
test ! -e "$sw_site/assets/new.js" || fail 'SW failure rollback left new assets'
# Measure allocations throughout a pre-switch failure and fallback restore.
# Large data makes an accidental additional full data copy observable.
if [[ "$(uname -s)" == Linux* ]]; then
  large_site="$fixture/large-site"
  large_stage="$fixture/large-stage"
  large_backup="$fixture/large-backup"
  large_work="$fixture/large-work"
  mkdir -p "$large_site/assets" "$large_site/data/audio" "$large_stage/assets" "$large_stage/data" "$large_work"
  dd if=/dev/zero of="$large_site/data/large.json" bs=1048576 count=32 status=none
  dd if=/dev/zero of="$large_site/assets/old.js" bs=1048576 count=4 status=none
  dd if=/dev/zero of="$large_site/index.html" bs=1048576 count=2 status=none
  dd if=/dev/zero of="$large_site/sw.js" bs=1048576 count=1 status=none
  printf audio > "$large_site/data/audio/media.mp3"
  dd if=/dev/zero of="$large_stage/assets/new.js" bs=1048576 count=3 status=none
  dd if=/dev/zero of="$large_stage/data/large.json" bs=1048576 count=1 status=none
  printf next > "$large_stage/index.html"
  printf nextsw > "$large_stage/sw.js"
  baseline=$(du -sk "$large_site" | awk '{print $1}')
  expanded=$(du -sk "$large_stage" | awk '{print $1}')
  mutable=$(mutable_kib "$large_site")
  assets=$(du -sk "$large_site/assets" | awk '{print $1}')
  core=$(core_kib "$large_site")
  bound=$(release_required_kib "$expanded" "$mutable" "$assets" "$core" 256)
  check_peak() {
    local consumed
    consumed=$(du -sk "$large_site" "$large_stage" "$large_work" "$large_backup" 2>/dev/null | awk '{sum += $1} END {print sum}')
    (( consumed - baseline <= bound )) || fail "rollback exceeded allocation bound: $consumed - $baseline > $bound"
  }
  # Match cp's actual argument list without depending on optional '--'.
  cp() {
    command cp "$@" || return
    check_peak
    if [[ "$*" == *"$large_stage/assets/."* && "${@: -1}" == "$large_work/new-assets/" ]]; then return 1; fi
  }
  backup_site "$large_site" "$large_backup"
  if deploy_release "$large_site" "$large_stage" "$large_backup" "$large_work"; then fail 'large pre-switch copy failure accepted'; fi
  unset -f cp
  check_peak
  cmp "$large_site/index.html" "$large_backup/index.html" || fail 'large core restore mismatch'
  cmp "$large_site/data/large.json" "$large_backup/data/large.json" || fail 'large data restore mismatch'
fi
echo 'PASS: backup independence, media reuse, validation, space bounds, copy/shape/signal failures, rollback and retention'
