#!/usr/bin/env bash
# 发版前全自动端到端冒烟门禁。
#
# 在 iOS 模拟器里用 App Store 审核账号「邮箱+密码」登录**生产**后端,验证:
#   ① 生产 API 可达  ② 审核账号已在生产就绪  ③ 登录 → 主导航链路通。
# 绿灯是提审 / TestFlight 上传前的硬门禁;红灯 fail-closed,阻止打出「连不上后端」或
# 「审核账号登不进」的废包(见 ios-test-flight/SKILL.md「上线前必查」)。
#
# 用 Release 配置构建 → 直接吃 Config/Release.xcconfig 的 API_BASE_URL,即将发布的那份配置;
# 模拟器以 ad-hoc「Sign to Run Locally」签名(空 DEVELOPMENT_TEAM 无碍,不需分发 profile)。
# 注意:**不能关签名**——未签名的 app 无法访问 Keychain(errSecMissingEntitlement),登录存
# token 会失败;必须让默认 ad-hoc 签名生效,登录链路才完整。审核凭据经 TEST_RUNNER_* 注入测试
# 运行进程(xcodebuild 转发 TEST_RUNNER_ 前缀环境变量,去前缀后 UITest 可读)。
#
# 仅 macOS + Xcode 26。可单独跑,也被 ios-test-flight 的 upload-testflight.sh 在上传前调用。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT="$IOS_DIR/DocPilot.xcodeproj"
SCHEME="DocPilotLiveSmoke"
BUILD_DIR="$IOS_DIR/build"
RESULT_BUNDLE="$BUILD_DIR/preflight-smoke.xcresult"

# —— 可覆盖项 ——(审核凭据非机密:已随提审下发给 Apple)
REVIEW_EMAIL="${REVIEW_EMAIL:-review@docpilot.app}"
REVIEW_PASSWORD="${REVIEW_PASSWORD:-DocPilot-Review-2026}"

for tool in xcodegen xcodebuild xcrun; do
  command -v "$tool" >/dev/null || { echo "缺少工具: $tool" >&2; exit 1; }
done

# 模拟器机型:未指定则自动挑第一台可用 iPhone(机器上的机型会随 Xcode 版本变,别硬编码)。
if [[ -z "${SIMULATOR_NAME:-}" ]]; then
  SIMULATOR_NAME="$(xcrun simctl list devices available | grep -oE 'iPhone [0-9]+[^(]*' | head -1 | sed 's/[[:space:]]*$//')"
  [[ -n "$SIMULATOR_NAME" ]] || { echo "✗ 找不到可用的 iPhone 模拟器;请装一个或用 SIMULATOR_NAME 指定。" >&2; exit 1; }
fi

# —— fail-closed:占位 API 地址 = 冒烟无意义,直接红 ——
# 冒烟必须打真实生产地址;这也顺带逼你在提审前把 Release.xcconfig 的 API_BASE_URL 改对。
if grep -q "api.example.invalid" "$IOS_DIR/Config/Release.xcconfig"; then
  echo "✗ Config/Release.xcconfig 的 API_BASE_URL 仍是占位 api.example.invalid。" >&2
  echo "  发版前冒烟必须打真实生产地址——请先把它改成生产 HTTPS 后端再跑。" >&2
  exit 1
fi

echo "▸ 生成工程 (xcodegen)"
xcodegen generate --spec "$IOS_DIR/project.yml"

echo "▸ 冒烟:审核账号密码登录生产($REVIEW_EMAIL @ $SIMULATOR_NAME)"
rm -rf "$RESULT_BUNDLE"
mkdir -p "$BUILD_DIR"

# TEST_RUNNER_* 走环境(供 xcodebuild 转发给运行进程)。不覆盖签名设置:模拟器默认 ad-hoc
# 签名,Keychain 可用(关签名会让登录存 token 失败)。
TEST_RUNNER_REVIEW_SMOKE=1 \
TEST_RUNNER_REVIEW_EMAIL="$REVIEW_EMAIL" \
TEST_RUNNER_REVIEW_PASSWORD="$REVIEW_PASSWORD" \
xcodebuild test \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination "platform=iOS Simulator,name=$SIMULATOR_NAME,OS=latest" \
  -only-testing:DocPilotUITests/ReviewLoginSmokeTests \
  -resultBundlePath "$RESULT_BUNDLE"

echo "✅ 发版前端到端冒烟通过:生产可达、审核账号可登、主导航正常。"
echo "   结果包:$RESULT_BUNDLE"
