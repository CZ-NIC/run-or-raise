#!/usr/bin/env bash

set -euo pipefail

status="$(git status --short)"
if [[ -n "${status}" && "${1:-}" != "--commit" ]]; then
    echo >&2 "Working tree is not clean, aborting release. Try \`make commit-and-release\` to commit it too."
    exit 1
fi

ver="$(jq '.["version-name"] | tonumber + 1' metadata.json -r)"

cat metadata.json | jq '.["version-name"] = "\($ver)"' --arg ver "${ver}" > metadata.json.tmp
mv metadata.json.tmp metadata.json

set -x
git add metadata.json
git commit -m "build: release v${ver}"
git tag "v${ver}"
git push origin main "v${ver}"
