#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

xcodegen generate --spec apps/ios/project.yml --quiet
git diff --exit-code -- apps/ios/DocPilot.xcodeproj apps/ios/Config/Info.plist
