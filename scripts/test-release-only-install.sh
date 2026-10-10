#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/server-install.sh"
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
site="$fixture/site"; stage="$fixture/stage"; backup="$fixture/backup"; work="$fixture/work"
mkdir -p "$site/assets" "$site/data/audio" "$stage/assets" "$stage/data" "$work"
printf old > "$site/index.html"; printf oldsw > "$site/sw.js"; printf asset > "$site/assets/old.js"
printf original > "$site/data/changed.json"; printf untouched > "$site/data/unrelated.json"
printf media > "$site/data/audio/media.mp3"
printf new > "$stage/index.html"; printf newsw > "$stage/sw.js"; printf newasset > "$stage/assets/new.js"
printf updated > "$stage/data/changed.json"; printf reading > "$stage/data/reading.json"
fail() { echo "FAIL: $*" >&2; exit 1; }
assert_content() { [[ "$(cat "$1")" == "$2" ]] || fail "content of $1"; }
backup_site "$site" "$backup" "$stage"
[[ -f "$backup/.data-targets" ]] || fail 'release-only backup lacks explicit targets'
[[ ! -e "$backup/data/unrelated.json" && ! -e "$backup/data/audio" ]] || fail 'release-only copied unchanged data/media'
[[ ! "$site/data/changed.json" -ef "$backup/data/changed.json" ]] || fail 'mutable backup shares inode'
assert_content "$backup/data/changed.json" original
make_fixture_zip() {
  "${CET_TEST_PYTHON:-python3}" - "$1" "$2" <<'PY'
import sys,zipfile
from pathlib import Path
root=Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2],'w',compression=zipfile.ZIP_DEFLATED) as z:
    for p in root.rglob('*'):
        if p.is_file(): z.write(p,p.relative_to(root).as_posix())
PY
}
make_fixture_zip "$stage" "$fixture/valid.zip"
validate_archive "$fixture/valid.zip"
validate_release_only_archive "$fixture/valid.zip"
[[ "$(incoming_data_names "$fixture/valid.zip" | sort)" == $'changed.json\nreading.json' ]] || fail 'archive data target extraction'
[[ "$(rollback_data_kib "$site" "$fixture/valid.zip")" == "$(du -sk "$site/data/changed.json" | awk '{print $1}')" ]] || fail 'rollback scratch must include largest existing target JSON'
[[ "$(release_required_kib 10 100 5 3 64 96)" == 293 ]] || fail 'release-only allocation must include old JSON rollback scratch'
deploy_release "$site" "$stage" "$backup" "$work"
assert_content "$site/data/changed.json" updated
assert_content "$site/data/reading.json" reading
assert_content "$site/data/unrelated.json" untouched
restore_backup "$site" "$backup" "$work"
assert_content "$site/index.html" old; assert_content "$site/sw.js" oldsw
assert_content "$site/data/changed.json" original
[[ ! -e "$site/data/reading.json" ]] || fail 'rollback retained newly introduced data'
assert_content "$site/data/unrelated.json" untouched; assert_content "$site/data/audio/media.mp3" media

# A failure after data and index replacement must perform the same limited rollback.
work2="$fixture/work2"; mkdir "$work2"
eval "$(declare -f atomic_copy | sed '1s/atomic_copy/original_atomic_copy/')"
atomic_copy() {
  if [[ "$2" == "$site/sw.js" ]]; then
    assert_content "$site/index.html" new
    assert_content "$site/data/changed.json" updated
    assert_content "$site/data/reading.json" reading
    return 1
  fi
  original_atomic_copy "$@"
}
if deploy_release "$site" "$stage" "$backup" "$work2"; then fail 'SW failure accepted'; fi
unset -f atomic_copy
assert_content "$site/index.html" old; assert_content "$site/data/changed.json" original
[[ ! -e "$site/data/reading.json" ]] || fail 'failed deployment kept new file'
assert_content "$site/data/unrelated.json" untouched; assert_content "$site/data/audio/media.mp3" media

# Verify a pre-switch failure with a large old target cannot exceed the bound.
if [[ "$(uname -s)" == Linux* ]]; then
  large_site="$fixture/large-site"; large_stage="$fixture/large-stage"; large_backup="$fixture/large-backup"; large_work="$fixture/large-work"
  mkdir -p "$large_site/assets" "$large_site/data" "$large_stage/assets" "$large_stage/data" "$large_work"
  printf old > "$large_site/index.html"; printf oldasset > "$large_site/assets/old.js"
  dd if=/dev/zero of="$large_site/data/changed.json" bs=1048576 count=32 status=none
  printf new > "$large_stage/index.html"; printf newasset > "$large_stage/assets/new.js"; printf newdata > "$large_stage/data/changed.json"
  make_fixture_zip "$large_stage" "$fixture/large.zip"
  baseline=$(du -sk "$large_site" | awk '{print $1}')
  expanded=$(du -sk "$large_stage" | awk '{print $1}')
  bound=$(release_required_kib "$expanded" "$(mutable_kib "$large_site" "$fixture/large.zip")" "$(du -sk "$large_site/assets" | awk '{print $1}')" "$(core_kib "$large_site")" 256 "$(rollback_data_kib "$large_site" "$fixture/large.zip")")
  check_peak() {
    local consumed
    consumed=$(du -sk "$large_site" "$large_stage" "$large_work" "$large_backup" 2>/dev/null | awk '{sum += $1} END {print sum}')
    (( consumed - baseline <= bound )) || fail "release-only rollback exceeded allocation bound: $consumed - $baseline > $bound"
  }
  cp() {
    command cp "$@" || return
    check_peak
    if [[ "${@: -1}" == "$large_work/new-assets/" ]]; then return 1; fi
  }
  backup_site "$large_site" "$large_backup" "$large_stage"
  atomic_copy() { original_atomic_copy "$@"; }
  if deploy_release "$large_site" "$large_stage" "$large_backup" "$large_work"; then fail 'large pre-switch failure accepted'; fi
  unset -f cp atomic_copy
  check_peak
  cmp "$large_site/data/changed.json" "$large_backup/data/changed.json" || fail 'large rollback mismatch'
fi

# Fail closed before backup if an incoming file collides with a live directory.
rm "$site/data/changed.json"; mkdir "$site/data/changed.json"
printf protected > "$site/data/changed.json/user.json"
if backup_site "$site" "$fixture/shape-backup" "$stage"; then fail 'target directory collision accepted'; fi
assert_content "$site/data/changed.json/user.json" protected
[[ ! -e "$fixture/shape-backup/.complete" ]] || fail 'unsafe backup marked complete'

# Limited backups accept only the flat JSON whitelist used by the packager.
mkdir "$stage/data/nested"; printf invalid > "$stage/data/nested/x.json"
if validate_release_only_stage "$stage"; then fail 'nested data accepted'; fi
make_fixture_zip "$stage" "$fixture/nested.zip"
if validate_release_only_archive "$fixture/nested.zip"; then fail 'nested archive data accepted'; fi
rm -rf "$stage/data/nested"
printf invalid > "$stage/data/secret.env"
if validate_release_only_stage "$stage"; then fail 'non-JSON data accepted'; fi
echo 'PASS: release-only independent backup, unchanged data/media, new-file removal, SW-failure rollback and collision/whitelist rejection'
