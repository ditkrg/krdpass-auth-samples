#!/usr/bin/env bash
# The supported-version table drifted a whole minor release behind CHANGELOG.md
# across six files at once, because it is hand-typed. This ties the one copy
# that survives to the release it claims to describe.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
released="$(grep -m1 -oE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' "$root/CHANGELOG.md" | tr -d '#[] ')"
minor="${released%.*}"

if ! grep -qE "^\| *${minor//./\\.}\.x *\|" "$root/docs/SECURITY.md"; then
  echo "::error::docs/SECURITY.md does not list ${minor}.x as supported, but CHANGELOG.md's latest release is ${released}."
  grep -A4 'Supported Versions' "$root/docs/SECURITY.md" >&2 || true
  exit 1
fi

echo "supported version ${minor}.x matches the ${released} release"
