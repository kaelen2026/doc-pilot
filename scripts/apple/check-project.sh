#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

xcodegen generate --spec apps/apple/project.yml --quiet
git diff --exit-code -- apps/apple/DocPilot.xcodeproj apps/apple/Config/Info.plist
