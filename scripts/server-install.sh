#!/usr/bin/env bash
set -Eeuo pipefail

die() { echo "$*" >&2; return 1; }
validate_site_root() { [[ "$1" == /var/www/cet-listening ]] || die "Refusing unexpected site root: $1"; }
validate_tree() {
  [[ -d "$1" && ! -L "$1" ]] || die "Invalid directory: $1" || return
  [[ -z "$(find "$1" ! -type d ! -type f -print -quit)" ]] || die "Unsupported link or special file in $1"
}
validate_optional_core() {
  local root="$1" item
  for item in "$root/sw.js" "$root/manifest.webmanifest" "$root/registerSW.js" "$root"/workbox-*.js; do
    if [[ -e "$item" || -L "$item" ]]; then
      [[ -f "$item" && ! -L "$item" ]] || die "Core artifact must be a regular file: $item" || return
    fi
  done
}
validate_stage() {
  validate_tree "$1" || return
  validate_optional_core "$1" || return
  [[ -f "$1/index.html" && -d "$1/assets" ]] || die 'Stage lacks index.html or assets' || return
  [[ ! -e "$1/data/audio" && ! -L "$1/data/audio" ]] || die 'Release must never contain data/audio' || return
  [[ ! -e "$1/data" || -d "$1/data" ]] || die 'Stage data must be a directory'
}
validate_live() {
  local site="$1" item
  [[ -d "$site" && ! -L "$site" ]] || die 'Invalid live site directory' || return
  validate_optional_core "$site" || return
  for item in index.html assets sw.js manifest.webmanifest registerSW.js data "$site"/workbox-*.js; do
    [[ "$item" == "$site/"* ]] || item="$site/$item"
    [[ ! -L "$item" ]] || die "Refusing live symlink: $item" || return
    if [[ -d "$item" ]]; then validate_tree "$item" || return; fi
  done
  [[ -f "$site/index.html" && -d "$site/assets" ]] || die 'Live site lacks recoverable core'
}
backup_site() {
  local site="$1" backup="$2" item
  validate_live "$site" || return
  [[ ! -e "$backup" ]] || die "Backup already exists: $backup" || return
  mkdir "$backup" || return
  for item in index.html assets sw.js manifest.webmanifest registerSW.js; do
    if [[ -e "$site/$item" ]]; then cp -a -- "$site/$item" "$backup/" || return; fi
  done
  for item in "$site"/workbox-*.js; do
    if [[ -f "$item" ]]; then cp -a -- "$item" "$backup/" || return; fi
  done
  if [[ -d "$site/data" ]]; then
    mkdir "$backup/data" || return
    while IFS= read -r -d '' item; do
      if [[ "${item##*/}" == audio ]]; then
        # Only immutable media may share inodes. Never fall back to a full copy.
        cp -al -- "$item" "$backup/data/" || return
      else
        cp -a -- "$item" "$backup/data/" || return
      fi
    done < <(find "$site/data" -mindepth 1 -maxdepth 1 -print0)
  fi
  printf 'Complete backup; audio is hardlinked and must remain immutable.\n' > "$backup/.complete" || return
}
atomic_copy() {
  cp -a -- "$1" "$3/copy.tmp" || return
  chmod 644 "$3/copy.tmp" || return
  mv -fT -- "$3/copy.tmp" "$2"
}
apply_release() {
  local site="$1" stage="$2" work="$3" file relative
  mkdir "$work/new-assets" || return
  # Preserve old hashed resources for pages already open before deployment.
  cp -a -- "$site/assets/." "$work/new-assets/" || return
  cp -a -- "$stage/assets/." "$work/new-assets/" || return
  find "$work/new-assets" -type d -exec chmod 755 {} + || return
  find "$work/new-assets" -type f -exec chmod 644 {} + || return
  mv -T -- "$site/assets" "$work/original-assets" || return
  mv -T -- "$work/new-assets" "$site/assets" || return
  for file in manifest.webmanifest registerSW.js; do
    if [[ -f "$stage/$file" ]]; then atomic_copy "$stage/$file" "$site/$file" "$work" || return; fi
  done
  for file in "$stage"/workbox-*.js; do
    if [[ -f "$file" ]]; then atomic_copy "$file" "$site/${file##*/}" "$work" || return; fi
  done
  if [[ -d "$stage/data" ]]; then
    while IFS= read -r -d '' file; do
      relative="${file#"$stage/"}"
      mkdir -p -- "$(dirname "$site/$relative")" || return
      atomic_copy "$file" "$site/$relative" "$work" || return
    done < <(find "$stage/data" -type f -print0)
  fi
  # Publish resources, then the entry point, and the service worker last: its
  # precache index revision must never resolve to the previous live entry point.
  atomic_copy "$stage/index.html" "$site/index.html" "$work" || return
  if [[ -f "$stage/sw.js" ]]; then atomic_copy "$stage/sw.js" "$site/sw.js" "$work" || return; fi
  return 0
}
restore_backup() {
  local site="$1" backup="$2" work="$3" item
  [[ -f "$backup/.complete" ]] || die "Incomplete backup: $backup" || return
  # Fresh copies/renames ensure no writes through backup inodes.
  if [[ -d "$work/original-assets" ]]; then
    if [[ -d "$site/assets" ]]; then mv -T -- "$site/assets" "$work/failed-assets" || return; fi
    mv -T -- "$work/original-assets" "$site/assets" || return
  else
    cp -a -- "$backup/assets" "$work/restored-assets" || return
    if [[ -d "$site/assets" ]]; then mv -T -- "$site/assets" "$work/failed-assets" || return; fi
    mv -T -- "$work/restored-assets" "$site/assets" || return
  fi
  for item in manifest.webmanifest registerSW.js; do
    if [[ -f "$backup/$item" ]]; then
      cp -a -- "$backup/$item" "$work/restore.tmp" && mv -fT -- "$work/restore.tmp" "$site/$item" || return
    else
      rm -f -- "$site/$item" || return
    fi
  done
  for item in "$site"/workbox-*.js; do
    if [[ -f "$item" ]]; then rm -f -- "$item" || return; fi
  done
  for item in "$backup"/workbox-*.js; do
    if [[ -f "$item" ]]; then cp -a -- "$item" "$site/" || return; fi
  done
  if [[ -d "$site/data" ]]; then
    while IFS= read -r -d '' item; do
      if [[ "${item##*/}" != audio ]]; then rm -rf -- "$item" || return; fi
    done < <(find "$site/data" -mindepth 1 -maxdepth 1 -print0)
  fi
  if [[ -d "$backup/data" ]]; then
    mkdir -p "$site/data" || return
    while IFS= read -r -d '' item; do
      if [[ "${item##*/}" != audio ]]; then cp -a -- "$item" "$site/data/" || return; fi
    done < <(find "$backup/data" -mindepth 1 -maxdepth 1 -print0)
  fi
  cp -a -- "$backup/index.html" "$work/restore.tmp" && mv -fT -- "$work/restore.tmp" "$site/index.html" || return
  # The restored worker's precache revision must see the restored entry point.
  if [[ -f "$backup/sw.js" ]]; then
    cp -a -- "$backup/sw.js" "$work/restore.tmp" && mv -fT -- "$work/restore.tmp" "$site/sw.js" || return
  else
    rm -f -- "$site/sw.js" || return
  fi
  return 0
}
deploy_release() {
  local site="$1" stage="$2" backup="$3" work="$4" previous_signal_traps rollback_status=0
  validate_stage "$stage" || return
  validate_live "$site" || return
  [[ -f "$backup/.complete" ]] || die 'Refusing installation without complete backup' || return
  if apply_release "$site" "$stage" "$work"; then return 0; fi
  echo 'Installation failed; restoring previous release.' >&2
  # A signal must not recursively enter restore while its scratch is partial.
  # Restore the caller's handlers only after the rollback has settled.
  previous_signal_traps=$(trap -p INT TERM)
  trap '' INT TERM
  restore_backup "$site" "$backup" "$work" || rollback_status=$?
  trap - INT TERM
  if [[ -n "$previous_signal_traps" ]]; then eval "$previous_signal_traps"; fi
  if (( rollback_status != 0 )); then
    echo "Rollback failed; recover from $backup; work retained at $work" >&2
    return 2
  fi
  return 1
}
assert_space() {
  [[ "$1" =~ ^[0-9]+$ && "$2" =~ ^[0-9]+$ ]] || die 'Invalid disk estimate' || return
  (( $2 >= $1 )) || die "Insufficient space on $3: need $1 KiB, have $2 KiB"
}
free_kib() { df -Pk -- "$1" | awk 'END {print $4}'; }
release_required_kib() {
  # Stage + incoming writes, one complete independent backup, two old-assets
  # scratch copies (pre-switch failure + fallback restore), and core temp.
  # restore_backup deletes non-media data BEFORE copying its backup, so there
  # is no additional full data scratch copy. Revisit if that order changes.
  printf '%s\n' "$((2 * $1 + $2 + 2 * $3 + $4 + $5))"
}
core_kib() {
  local site="$1" item total=0 size
  for item in index.html sw.js manifest.webmanifest registerSW.js "$site"/workbox-*.js; do
    [[ "$item" == "$site/"* ]] || item="$site/$item"
    if [[ -f "$item" ]]; then
      size=$(du -sk -- "$item" | awk '{print $1}') || return
      total=$((total + size))
    fi
  done
  echo "$total"
}
mutable_kib() {
  local site="$1" item total=0 size
  for item in index.html assets sw.js manifest.webmanifest registerSW.js; do
    if [[ -e "$site/$item" ]]; then
      size=$(du -sk -- "$site/$item" | awk '{print $1}') || return
      total=$((total + size))
    fi
  done
  if [[ -d "$site/data" ]]; then
    while IFS= read -r -d '' item; do
      if [[ "${item##*/}" != audio ]]; then
        size=$(du -sk -- "$item" | awk '{print $1}') || return
        total=$((total + size))
      fi
    done < <(find "$site/data" -mindepth 1 -maxdepth 1 -print0)
  fi
  for item in "$site"/workbox-*.js; do
    if [[ -f "$item" ]]; then size=$(du -sk -- "$item" | awk '{print $1}'); total=$((total + size)); fi
  done
  echo "$total"
}
validate_archive() {
  local entry unzip_status=0
  unzip -tq "$1" >/dev/null || unzip_status=$?
  (( unzip_status <= 1 )) || return "$unzip_status"
  while IFS= read -r entry; do
    # PowerShell Compress-Archive emits backslashes; Info-ZIP converts them.
    # Validate the converted path too, including traversal and media rejection.
    entry="${entry//\\//}"
    [[ -n "$entry" && "$entry" != /* && "$entry" != *:* && "$entry" != *$'\r'* ]] || die 'Unsafe archive path' || return
    case "/$entry/" in */../*|*/./*) die 'Unsafe archive path'; return 1;; esac
    case "$entry" in data/audio|data/audio/*) die 'Release must never contain data/audio'; return 1;; esac
  done < <(unzip -Z1 "$1")
  [[ -z "$(unzip -Z -l "$1" | awk '$1 ~ /^l/ {print; exit}')" ]] || die 'Archive symlinks are forbidden'
}
archive_expanded_kib() {
  unzip -l "$1" | awk 'NF >= 4 && $1 ~ /^[0-9]+$/ && $2 ~ /^[0-9]/ {n++; bytes += $1} END {printf "%.0f", int((bytes+1023)/1024) + n*8}'
}
main() (
  local site="${1:?missing site root}" zip="${2:?missing release zip}"
  local stage='' work='' backup='' backup_root=/var/www/backups status=0 keep_work=0 started=0 unzip_status=0
  local expanded mutable old_assets core media_entries metadata required stage_required
  validate_site_root "$site" || exit 2
  [[ "$(readlink -f -- "$site")" == "$site" ]] || die 'Site resolves outside allowlist' || exit 2
  [[ "$zip" == /tmp/cet-listening-release.zip && -f "$zip" && ! -L "$zip" && -O "$zip" ]] || die 'Refusing unowned release zip' || exit 2
  [[ ! -L "$backup_root" ]] || die 'Backup root cannot be a symlink' || exit 2
  validate_live "$site" || exit 2
  validate_archive "$zip" || exit 2
  # Account for per-entry blocks, media link metadata and a 64 MiB reserve.
  expanded=$(archive_expanded_kib "$zip") || exit 2
  mutable=$(mutable_kib "$site") || exit 2
  old_assets=$(du -sk -- "$site/assets" | awk '{print $1}') || exit 2
  core=$(core_kib "$site") || exit 2
  media_entries=0
  if [[ -d "$site/data/audio" ]]; then media_entries=$(find "$site/data/audio" -printf '.\n' | wc -l); fi
  metadata=$((media_entries * 4 + 65536))
  stage_required=$((expanded + 65536))
  # Stage + backup + merged assets/data installation + rollback scratch.
  required=$(release_required_kib "$expanded" "$mutable" "$old_assets" "$core" "$metadata") || exit 2
  assert_space "$stage_required" "$(free_kib /tmp)" /tmp || exit 2
  assert_space "$required" "$(free_kib "$site")" "$site" || exit 2
  mkdir -p "$backup_root" || exit 2
  [[ "$(stat -c %d "$site")" == "$(stat -c %d "$backup_root")" ]] || die 'Media backup requires same filesystem' || exit 2
  assert_space "$required" "$(free_kib "$backup_root")" "$backup_root" || exit 2
  echo "Preflight: expanded=$expanded KiB, mutable=$mutable KiB, media-link/reserve=$metadata KiB, total=$required KiB"
  cleanup() {
    status=$?
    # Only verified parent/prefix paths created by this invocation are removed.
    if [[ -n "$stage" && "$stage" == /tmp/cet-listening-stage.* && "$(dirname "$stage")" == /tmp && ! -L "$stage" ]]; then rm -rf -- "$stage"; fi
    if [[ "$keep_work" == 0 && -n "$work" && "$work" == "$site"/.cet-listening-work.* && "$(dirname "$work")" == "$site" && ! -L "$work" ]]; then rm -rf -- "$work"; fi
    if [[ "$zip" == /tmp/cet-listening-release.zip && -f "$zip" && ! -L "$zip" && -O "$zip" ]]; then rm -f -- "$zip"; fi
    exit "$status"
  }
  trap cleanup EXIT
  interrupted() {
    trap '' INT TERM
    if [[ "$started" == 1 ]]; then
      if ! restore_backup "$site" "$backup" "$work"; then
        keep_work=1
        echo "Interrupted rollback failed; recover from $backup; work retained at $work" >&2
      fi
    fi
    exit 130
  }
  trap interrupted INT TERM
  stage=$(mktemp -d /tmp/cet-listening-stage.XXXXXX) || exit 2
  unzip -q "$zip" -d "$stage" || unzip_status=$?
  (( unzip_status <= 1 )) || exit 2
  validate_stage "$stage" || exit 2
  backup="$backup_root/cet-listening-$(date +%Y%m%d-%H%M%S)-${stage##*.}"
  backup_site "$site" "$backup" || exit 2
  work=$(mktemp -d "$site/.cet-listening-work.XXXXXX") || exit 2
  started=1
  if deploy_release "$site" "$stage" "$backup" "$work"; then
    started=0
    echo "Backup: $backup"
  else
    status=$?
    [[ "$status" == 2 ]] && keep_work=1
    exit "$status"
  fi
)

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
