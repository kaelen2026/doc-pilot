#!/usr/bin/env bash
# 采集 App Store 用的 iPhone 截图:选机型 → xcodegen → 模拟器构建/安装/启动 → 交互式逐屏截图。
# 只做本地安全操作(跑模拟器 + simctl io screenshot),不碰网络、不改任何 App Store Connect 记录。
# 详见同目录 SKILL.md。仅 macOS + Xcode。
set -euo pipefail

# —— 定位仓库根与 iOS 工程(脚本在 .claude/skills/app-store-release/scripts/ 下)——
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
IOS_DIR="$REPO_ROOT/apps/ios"
PROJECT="$IOS_DIR/DocPilot.xcodeproj"
SCHEME="docpilot"
BUNDLE_ID="dev.w3ctech.docpilot"
BUILD_DIR="$IOS_DIR/build"
DERIVED="$BUILD_DIR/sim"

# —— 参数 ——
DEVICE=""
OUT_DIR="$BUILD_DIR/screenshots"
API_BASE=""
CONFIG="Debug"
usage() {
  cat >&2 <<'EOF'
用法: capture-screenshots.sh [--device "iPhone 17 Pro Max"] [--api-base URL] [--out DIR] [--config Debug|Release]
  --device NAME    模拟器机型(默认自动挑最新 iPhone N Pro Max = 6.9")
  --api-base URL   模拟器里 app 连的后端(要有真实内容才好看;省略则用 Debug.xcconfig 默认)
  --out DIR        截图输出目录(默认 apps/ios/build/screenshots)
  --config NAME    构建配置(默认 Debug)
EOF
  exit "${1:-0}"
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --device) DEVICE="${2:?--device 需要值}"; shift 2 ;;
    --api-base) API_BASE="${2:?--api-base 需要值}"; shift 2 ;;
    --out) OUT_DIR="${2:?--out 需要值}"; shift 2 ;;
    --config) CONFIG="${2:?--config 需要值}"; shift 2 ;;
    -h|--help) usage 0 ;;
    *) echo "未知参数: $1" >&2; usage 1 ;;
  esac
done

for tool in xcodegen xcodebuild xcrun; do
  command -v "$tool" >/dev/null || { echo "缺少工具: $tool" >&2; exit 1; }
done

# —— 选机型:默认自动挑「iPhone N Pro Max」里 N 最大的一台(6.9")——
if [[ -z "$DEVICE" ]]; then
  DEVICE="$(xcrun simctl list devices available | grep -oE 'iPhone [0-9]+ Pro Max' | sort -t' ' -k2 -n -u | tail -1)"
  [[ -n "$DEVICE" ]] || { echo "没自动找到 Pro Max 模拟器,请用 --device 指定(见 xcrun simctl list devices available)" >&2; exit 1; }
fi
# 取该机型第一台可用实例的 UDID(精确匹配 "名字 (",避开 "Pro" 是 "Pro Max" 前缀的歧义)
UDID="$(xcrun simctl list devices available | grep -F "$DEVICE (" | head -1 | grep -oiE '[0-9A-F-]{36}' | head -1)"
[[ -n "$UDID" ]] || { echo "找不到可用模拟器: $DEVICE" >&2; exit 1; }
echo "▸ 机型: $DEVICE ($UDID)"

echo "▸ 生成工程 (xcodegen)"
xcodegen generate --spec "$IOS_DIR/project.yml"

echo "▸ 构建 ($CONFIG, iphonesimulator)${API_BASE:+,后端=$API_BASE}"
BUILD_OVERRIDES=()
[[ -n "$API_BASE" ]] && BUILD_OVERRIDES+=(API_BASE_URL="$API_BASE")
rm -rf "$DERIVED"
xcodebuild build \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,name=$DEVICE" \
  -derivedDataPath "$DERIVED" \
  "${BUILD_OVERRIDES[@]}"

APP="$(find "$DERIVED/Build/Products/$CONFIG-iphonesimulator" -maxdepth 1 -name '*.app' | head -1)"
[[ -n "$APP" ]] || { echo "构建产物里找不到 .app" >&2; exit 1; }

echo "▸ 启动模拟器并安装"
xcrun simctl boot "$UDID" 2>/dev/null || true   # 已启动会报错,忽略
open -a Simulator
xcrun simctl bootstatus "$UDID" >/dev/null 2>&1 || true
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" "$BUNDLE_ID" >/dev/null || true

mkdir -p "$OUT_DIR"
SAFE_DEVICE="${DEVICE// /_}"

# —— 交互式逐屏截图 ——(你在模拟器里导航到目标画面,回车即截;s 跳过)
# 建议覆盖 DocPilot 核心价值链路,避开空态/占位/真实隐私内容。
SHOTS=("01-login" "02-documents" "03-reader" "04-chat-citation" "05-search")
echo ""
echo "▸ 开始截图。请先在模拟器里登录并准备好有内容的画面。"
echo "  每步:导航到对应画面 → 回车截图(输入 s 跳过,q 结束)。"
for name in "${SHOTS[@]}"; do
  read -rp "  → 【$name】就绪后回车(s 跳过 / q 结束): " ans
  case "$ans" in
    q|Q) break ;;
    s|S) echo "     跳过 $name"; continue ;;
  esac
  out="$OUT_DIR/${SAFE_DEVICE}-${name}.png"
  xcrun simctl io "$UDID" screenshot "$out"
  echo "     ✅ $out"
done

# —— 追加任意额外截图 ——
while true; do
  read -rp "  → 再截一张?输入名字(直接回车结束): " extra
  [[ -z "$extra" ]] && break
  out="$OUT_DIR/${SAFE_DEVICE}-${extra// /_}.png"
  xcrun simctl io "$UDID" screenshot "$out"
  echo "     ✅ $out"
done

echo ""
echo "✅ 截图在: $OUT_DIR"
echo "   6.9\" 一组即可,ASC 会自动缩放到其它尺寸。到 App Store Connect 该版本手动上传。"
