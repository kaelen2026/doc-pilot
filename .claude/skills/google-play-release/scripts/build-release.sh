#!/usr/bin/env bash
# 构建 DocPilot Android 生产签名 AAB:bundleRelease(用上传密钥签名)→ jarsigner -verify。
# 纯本地构建,不碰网络、不改任何 Play 线上记录。密钥与口令只经环境变量传入,绝不写进仓库。
# 详见同目录 SKILL.md。
set -euo pipefail

# —— 定位仓库根与 Android 工程 ——(脚本在 .claude/skills/google-play-release/scripts/ 下)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
ANDROID_DIR="$REPO_ROOT/apps/android"
GRADLE_BUILD="$ANDROID_DIR/app/build.gradle.kts"
AAB_PATH="$ANDROID_DIR/app/build/outputs/bundle/release/app-release.aab"

# —— 参数 ——
API_BASE=""
GOOGLE_CLIENT_ID=""
VERSION_NAME=""
VERSION_CODE=""
BUILD_APK=0
usage() {
  cat >&2 <<'EOF'
用法: build-release.sh --api-base https://<生产域名> [--google-client-id <id>]
                       [--version X.Y.Z] [--code N] [--apk]
  --api-base <url>        (生产包必填)注入 BuildConfig.API_BASE_URL,须为生产 HTTPS 域名
  --google-client-id <id> Web OAuth Client ID,注入 BuildConfig.GOOGLE_CLIENT_ID
  --version X.Y.Z         覆盖 versionName(默认取 build.gradle 的 0.1.0)
  --code N                覆盖 versionCode(默认 date +%s;整数、单调递增、< 21 亿)
  --apk                   顺带产出签名 APK 供旁装冒烟(Play 上架用 AAB,不用 APK)

必需环境变量(上传密钥,均不入库):
  DOC_PILOT_UPLOAD_KEYSTORE       上传密钥库 .jks 路径
  DOC_PILOT_UPLOAD_STORE_PASSWORD 密钥库口令
  DOC_PILOT_UPLOAD_KEY_ALIAS      key 别名
  DOC_PILOT_UPLOAD_KEY_PASSWORD   key 口令
EOF
  exit "${1:-0}"
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-base) API_BASE="${2:?--api-base 需要值}"; shift 2 ;;
    --google-client-id) GOOGLE_CLIENT_ID="${2:?--google-client-id 需要值}"; shift 2 ;;
    --version) VERSION_NAME="${2:?--version 需要值}"; shift 2 ;;
    --code) VERSION_CODE="${2:?--code 需要值}"; shift 2 ;;
    --apk) BUILD_APK=1; shift ;;
    -h|--help) usage 0 ;;
    *) echo "未知参数: $1" >&2; usage 1 ;;
  esac
done

# —— 校验上传密钥凭据 ——
: "${DOC_PILOT_UPLOAD_KEYSTORE:?缺少 DOC_PILOT_UPLOAD_KEYSTORE(上传密钥库 .jks 路径)}"
: "${DOC_PILOT_UPLOAD_STORE_PASSWORD:?缺少 DOC_PILOT_UPLOAD_STORE_PASSWORD}"
: "${DOC_PILOT_UPLOAD_KEY_ALIAS:?缺少 DOC_PILOT_UPLOAD_KEY_ALIAS}"
: "${DOC_PILOT_UPLOAD_KEY_PASSWORD:?缺少 DOC_PILOT_UPLOAD_KEY_PASSWORD}"
KEYSTORE="${DOC_PILOT_UPLOAD_KEYSTORE/#\~/$HOME}"   # 展开 ~
[[ -f "$KEYSTORE" ]] || { echo "找不到上传密钥库: $KEYSTORE" >&2; exit 1; }

# —— 校验 release 已接签名(步骤① 的一次性代码改动)——
if ! grep -q 'signingConfigs.getByName("release")' "$GRADLE_BUILD"; then
  echo "✗ apps/android/app/build.gradle.kts 的 release buildType 还没接 signingConfig。" >&2
  echo "  先按 SKILL.md 步骤① 给 release 加 signingConfigs 并 signingConfig = signingConfigs.getByName(\"release\")。" >&2
  exit 1
fi

# —— 校验工具 ——(gradlew 在 apps/android;jarsigner 随 JDK)
command -v jarsigner >/dev/null || { echo "缺少工具: jarsigner(需 JDK 17)" >&2; exit 1; }
[[ -x "$ANDROID_DIR/gradlew" ]] || { echo "找不到 $ANDROID_DIR/gradlew" >&2; exit 1; }

# —— 生产包必须连生产后端,占位/本地地址一律中止 ——
if [[ -z "$API_BASE" ]]; then
  echo "✗ 生产包必须用 --api-base 指定生产 HTTPS 后端;缺省会打出连本地(10.0.2.2)的废包。" >&2
  exit 1
fi
case "$API_BASE" in
  https://*) ;;
  *) echo "✗ --api-base 必须是 https:// 域名(收到: $API_BASE)。" >&2; exit 1 ;;
esac
if echo "$API_BASE" | grep -qiE '10\.0\.2\.2|localhost|127\.0\.0\.1|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.'; then
  echo "✗ --api-base 像本地/内网地址($API_BASE);生产包必连公网生产域名。" >&2
  exit 1
fi

# versionCode 默认时间戳(整数、单调递增、远低于 Play 上限 2100000000)
[[ -n "$VERSION_CODE" ]] || VERSION_CODE="$(date +%s)"

# —— 组装 Gradle -P 属性(签名 / 版本 / 接线)——
GRADLE_PROPS=(
  "-PDOC_PILOT_UPLOAD_STORE_FILE=$KEYSTORE"
  "-PDOC_PILOT_UPLOAD_STORE_PASSWORD=$DOC_PILOT_UPLOAD_STORE_PASSWORD"
  "-PDOC_PILOT_UPLOAD_KEY_ALIAS=$DOC_PILOT_UPLOAD_KEY_ALIAS"
  "-PDOC_PILOT_UPLOAD_KEY_PASSWORD=$DOC_PILOT_UPLOAD_KEY_PASSWORD"
  "-PDOC_PILOT_API_URL=$API_BASE"
  "-PDOC_PILOT_VERSION_CODE=$VERSION_CODE"
)
[[ -n "$GOOGLE_CLIENT_ID" ]] && GRADLE_PROPS+=("-PDOC_PILOT_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID")
[[ -n "$VERSION_NAME" ]] && GRADLE_PROPS+=("-PDOC_PILOT_VERSION_NAME=$VERSION_NAME")

TASKS=(":app:bundleRelease")
[[ "$BUILD_APK" == 1 ]] && TASKS+=(":app:assembleRelease")

echo "▸ 构建签名 AAB (versionCode=$VERSION_CODE, api=$API_BASE)"
( cd "$ANDROID_DIR" && ./gradlew --no-daemon "${TASKS[@]}" "${GRADLE_PROPS[@]}" )

[[ -f "$AAB_PATH" ]] || { echo "✗ 未找到产物 AAB: $AAB_PATH" >&2; exit 1; }

echo "▸ 校验签名 (jarsigner -verify)"
jarsigner -verify "$AAB_PATH" >/dev/null || { echo "✗ AAB 签名校验失败" >&2; exit 1; }

echo "✅ 已产出签名 AAB:"
echo "   $AAB_PATH"
echo "   versionCode=$VERSION_CODE${VERSION_NAME:+  versionName=$VERSION_NAME}"
if [[ "$BUILD_APK" == 1 ]]; then
  echo "   APK(仅旁装冒烟): $ANDROID_DIR/app/build/outputs/apk/release/app-release.apk"
fi
echo "   下一步:Play Console → Testing/Production → Create release → 上传该 AAB(见 SKILL.md 步骤④⑤)。"
