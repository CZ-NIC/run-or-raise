#!/usr/bin/env bash

set -euo pipefail

mkdir -p build

args=()

for file in lib convenience.js shortcuts.default README.md CHANGELOG.md LICENSE; do
    args+=(--extra-source="${file}")
done

set -x
gnome-extensions pack -f --out-dir build "${args[@]}"
