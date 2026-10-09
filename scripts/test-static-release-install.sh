#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/server-install.sh"
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
files=(favicon.svg icon-192.svg icon-512.svg icons.svg landing.html wechat-pay.jpg)
fail() { echo "FAIL: $*" >&2; exit 1; }
assert_content() { [[ "$(cat "$1")" == "$2" ]] || fail "content of $1"; }
eval "$(declare -f atomic_copy | sed '1s/atomic_copy/original_atomic_copy/')"
for mode in full release-only; do
  for scenario in success failure; do
    root="$fixture/$mode-$scenario"
    site="$root/site"; stage="$root/stage"; backup="$root/backup"; work="$root/work"
    mkdir -p "$site/assets" "$site/data/audio" "$stage/assets" "$stage/data" "$work"
    printf old-index > "$site/index.html"; printf old-asset > "$site/assets/old.js"
    printf untouched > "$site/data/unrelated.json"; printf media > "$site/data/audio/media.mp3"
    printf new-index > "$stage/index.html"; printf new-asset > "$stage/assets/new.js"
    for name in "${files[@]}"; do
      [[ "$name" == icon-512.svg ]] || printf 'old-%s' "$name" > "$site/$name"
      printf 'new-%s' "$name" > "$stage/$name"
    done
    validate_stage "$stage"; validate_live "$site"
    # Both backup scopes must preserve old root resources independently.
    if [[ "$mode" == full ]]; then backup_site "$site" "$backup"; else backup_site "$site" "$backup" "$stage"; fi
    for name in "${files[@]}"; do
      [[ "$name" == icon-512.svg ]] && continue
      assert_content "$backup/$name" "old-$name"
      [[ ! "$site/$name" -ef "$backup/$name" ]] || fail 'static backup shares inode'
    done
    atomic_copy() {
      if [[ "$scenario" == failure && "$2" == "$site/index.html" ]]; then return 1; fi
      original_atomic_copy "$@"
    }
    if [[ "$scenario" == success ]]; then
      deploy_release "$site" "$stage" "$backup" "$work"
      for name in "${files[@]}"; do assert_content "$site/$name" "new-$name"; done
      assert_content "$site/index.html" new-index
      restore_backup "$site" "$backup" "$work"
    else
      if deploy_release "$site" "$stage" "$backup" "$work"; then fail 'injected entry switch failure accepted'; fi
    fi
    for name in "${files[@]}"; do
      if [[ "$name" == icon-512.svg ]]; then [[ ! -e "$site/$name" ]] || fail 'rollback kept new static resource'; else assert_content "$site/$name" "old-$name"; fi
    done
    assert_content "$site/index.html" old-index
    assert_content "$site/data/unrelated.json" untouched
    assert_content "$site/data/audio/media.mp3" media
    # Existing backups did not include root static resources. New rollback
    # must not infer absence from them and delete the live site icons.
    rm "$backup/.static-resources"
    for name in "${files[@]}"; do
      rm -f "$backup/$name"
      printf 'legacy-live-%s' "$name" > "$site/$name"
    done
    legacy_work="$root/legacy-work"; mkdir "$legacy_work"
    restore_backup "$site" "$backup" "$legacy_work"
    for name in "${files[@]}"; do assert_content "$site/$name" "legacy-live-$name"; done
    for where in "$site" "$stage"; do
      mv "$where/favicon.svg" "$root/favicon.saved"
      mkdir "$where/favicon.svg"
      if [[ "$where" == "$site" ]]; then
        if validate_live "$where"; then fail 'live static directory accepted'; fi
      else
        if validate_stage "$where"; then fail 'stage static directory accepted'; fi
      fi
      rmdir "$where/favicon.svg"; mv "$root/favicon.saved" "$where/favicon.svg"
    done
  done
done
echo 'PASS: root static resources install, independent backup and rollback in both scopes'
