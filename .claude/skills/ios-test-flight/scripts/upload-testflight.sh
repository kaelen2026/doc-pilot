#!/usr/bin/env bash
# 打包 DocPilot iOS 并上传 TestFlight:archive → exportArchive(destination=upload)。
# 认证走 App Store Connect API Key(免交互)。仅 macOS + Xcode。
# 详见同目录 SKILL.md。凭据只经环境变量传入,绝不写进仓库。
set -euo pipefail

# —— 定位仓库根与 iOS 工程 ——(脚本在 .claude/skills/ios-test-flight/scripts/ 下)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
IOS_DIR="$REPO_ROOT/apps/ios"
PROJECT="$IOS_DIR/DocPilot.xcodeproj"
SCHEME="docpilot"
BUILD_DIR="$IOS_DIR/build"
ARCHIVE_PATH="$BUILD_DIR/DocPilot.xcarchive"
EXPORT_DIR="$BUILD_DIR/export"
PLIST="$BUILD_DIR/ExportOptions.plist"

# —— 参数 ——
BUILD_NUMBER=""
MARKETING_VERSION=""
DRY_RUN=0
usage() {
  cat >&2 <<'EOF'
用法: upload-testflight.sh [--build N] [--version X.Y.Z] [--dry-run]
  --build N       指定 build number(默认时间戳 YYYYMMDDHHMM,单调递增)
  --version X.Y.Z 覆盖 MARKETING_VERSION(默认取 project.yml 的值)
  --dry-run       只归档+导出 .ipa,不上传(destination=export)

必需环境变量: TEAM_ID ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_PATH
EOF
  exit "${1:-0}"
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --build) BUILD_NUMBER="${2:?--build 需要值}"; shift 2 ;;
    --version) MARKETING_VERSION="${2:?--version 需要值}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "未知参数: $1" >&2; usage 1 ;;
  esac
done

# —— 校验凭据与工具 ——
: "${TEAM_ID:?缺少 TEAM_ID(10 位,= DEVELOPMENT_TEAM)}"
: "${ASC_KEY_ID:?缺少 ASC_KEY_ID(App Store Connect API Key ID)}"
: "${ASC_ISSUER_ID:?缺少 ASC_ISSUER_ID(App Store Connect Issuer ID)}"
: "${ASC_KEY_PATH:?缺少 ASC_KEY_PATH(AuthKey_XXXX.p8 路径)}"
ASC_KEY_PATH="${ASC_KEY_PATH/#\~/$HOME}"   # 展开 ~
[[ -f "$ASC_KEY_PATH" ]] || { echo "找不到 API Key 文件: $ASC_KEY_PATH" >&2; exit 1; }
for tool in xcodegen xcodebuild xcrun; do
  command -v "$tool" >/dev/null || { echo "缺少工具: $tool" >&2; exit 1; }
done

# build number 默认时间戳;必须单调递增否则 TestFlight 拒收
if [[ -z "$BUILD_NUMBER" ]]; then BUILD_NUMBER="$(date +%Y%m%d%H%M)"; fi

# —— API_BASE_URL 生产地址预警(占位值会导致包连不上后端)——
if grep -q "api.example.invalid" "$IOS_DIR/Config/Release.xcconfig"; then
  echo "⚠️  Release.xcconfig 的 API_BASE_URL 仍是占位 api.example.invalid —— 这个包不会连上真实后端。" >&2
  echo "    继续将打出一个连不上后端的包;确认无误请在 5 秒内不要中断。" >&2
  sleep 5
fi

echo "▸ 生成工程 (xcodegen)"
xcodegen generate --spec "$IOS_DIR/project.yml"

# —— 认证参数(archive/export 复用)——
AUTH_ARGS=(
  -allowProvisioningUpdates
  -authenticationKeyPath "$ASC_KEY_PATH"
  -authenticationKeyID "$ASC_KEY_ID"
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"
)

VERSION_OVERRIDES=(CURRENT_PROJECT_VERSION="$BUILD_NUMBER")
[[ -n "$MARKETING_VERSION" ]] && VERSION_OVERRIDES+=(MARKETING_VERSION="$MARKETING_VERSION")

echo "▸ 归档 (Release, build=$BUILD_NUMBER)"
rm -rf "$ARCHIVE_PATH"
xcodebuild archive \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  "${VERSION_OVERRIDES[@]}" \
  "${AUTH_ARGS[@]}"

# —— 生成 ExportOptions.plist(destination 按 --dry-run 切换)——
DESTINATION="upload"; [[ "$DRY_RUN" == 1 ]] && DESTINATION="export"
mkdir -p "$BUILD_DIR"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>${DESTINATION}</string>
  <key>teamID</key><string>${TEAM_ID}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
</dict>
</plist>
EOF

echo "▸ 导出并${DRY_RUN:+(dry-run 不)}上传 (destination=$DESTINATION)"
rm -rf "$EXPORT_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$PLIST" \
  "${AUTH_ARGS[@]}"

if [[ "$DRY_RUN" == 1 ]]; then
  echo "✅ dry-run 完成:.ipa 在 $EXPORT_DIR(未上传)"
else
  echo "✅ 已上传 build $BUILD_NUMBER 到 App Store Connect。"
  echo "   到 TestFlight 查看处理状态(Processing → Ready),再分配测试组。"
fi
