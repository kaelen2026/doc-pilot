#!/usr/bin/env bash
# 把 DocPilot 的签名 APK 直传华为 AppGallery Connect 并提交发布,走官方 Publishing API。
# 无第三方依赖(仅 curl + jq),凭据只经环境变量传入,绝不写进仓库。商业使用无许可证顾虑。
#
# 流程(官方 AGC Publishing API v2,APK 直传):
#   ① oauth2/v1/token 取 access_token
#   ② publish/v2/upload-url/for-obs 取 OBS 预签名上传地址
#   ③ PUT 到 OBS(回放接口返回的签名 header),上传 APK 字节
#   ④ publish/v2/app-file-info 绑定已传文件(fileType=5)
#   ⑤ publish/v2/app-submit 提交发布
# 端点/字段对齐官方 API(参照社区 fastlane 插件的工作实现校验)。
set -eo pipefail

API="https://connect-api.cloud.huawei.com/api"

# —— 参数 ——
APK=""
REMARK=""
REMARK_FILE=""
RELEASE_TYPE=""   # 留空=正常全量发布;=1 公测(open testing)
usage() {
  cat >&2 <<'EOF'
用法: upload-huawei-agc.sh --apk <path> [--remark <文本> | --remark-file <path>] [--release-type <n>]
  --apk <path>         (必填)已签名的 release APK 路径
  --remark <文本>      更新说明(3–500 字);会做 URL 编码
  --remark-file <path> 从文件读更新说明(与 --remark 二选一)
  --release-type <n>   留空=正常全量发布;1=公测。默认正常发布

必需环境变量(华为 AGC「API 客户端」凭据 + 应用):
  HUAWEI_CLIENT_ID      AGC → 用户与访问 → API 客户端 的 Client ID
  HUAWEI_CLIENT_SECRET  同上的 Client Secret
  HUAWEI_APP_ID         该 App 在 AGC 的 App ID(纯数字)
EOF
  exit "${1:-0}"
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apk) APK="${2:?--apk 需要值}"; shift 2 ;;
    --remark) REMARK="${2:?--remark 需要值}"; shift 2 ;;
    --remark-file) REMARK_FILE="${2:?--remark-file 需要值}"; shift 2 ;;
    --release-type) RELEASE_TYPE="${2:?--release-type 需要值}"; shift 2 ;;
    -h|--help) usage 0 ;;
    *) echo "未知参数: $1" >&2; usage 1 ;;
  esac
done

# —— 校验凭据与工具 ——
: "${HUAWEI_CLIENT_ID:?缺少 HUAWEI_CLIENT_ID}"
: "${HUAWEI_CLIENT_SECRET:?缺少 HUAWEI_CLIENT_SECRET}"
: "${HUAWEI_APP_ID:?缺少 HUAWEI_APP_ID}"
[[ -n "$APK" ]] || { echo "✗ 缺少 --apk" >&2; usage 1; }
[[ -f "$APK" ]] || { echo "✗ 找不到 APK: $APK" >&2; exit 1; }
for tool in curl jq; do
  command -v "$tool" >/dev/null || { echo "✗ 缺少工具: $tool" >&2; exit 1; }
done

# remark 来源二选一
if [[ -n "$REMARK_FILE" ]]; then
  [[ -f "$REMARK_FILE" ]] || { echo "✗ 找不到 --remark-file: $REMARK_FILE" >&2; exit 1; }
  REMARK="$(cat "$REMARK_FILE")"
fi

# AGC 统一用 ret.code==0 表成功;非 0 打印 ret 后中止。
assert_ret_ok() {
  local body="$1" step="$2" code
  code="$(printf '%s' "$body" | jq -r '.ret.code // empty')"
  if [[ -n "$code" && "$code" != "0" ]]; then
    echo "✗ ${step}失败:$(printf '%s' "$body" | jq -c '.ret')" >&2
    exit 1
  fi
}

echo "▸ ① 获取 access token"
TOKEN_RESP="$(curl -fsS -X POST "$API/oauth2/v1/token" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc --arg id "$HUAWEI_CLIENT_ID" --arg secret "$HUAWEI_CLIENT_SECRET" \
        '{client_id:$id, grant_type:"client_credentials", client_secret:$secret}')")"
TOKEN="$(printf '%s' "$TOKEN_RESP" | jq -r '.access_token // empty')"
[[ -n "$TOKEN" ]] || { echo "✗ 取 token 失败(检查 Client ID/Secret):$TOKEN_RESP" >&2; exit 1; }

echo "▸ ② 获取 OBS 上传地址"
SIZE="$(wc -c < "$APK" | tr -d ' ')"
URL_RESP="$(curl -fsS -G "$API/publish/v2/upload-url/for-obs" \
  --data-urlencode "appId=$HUAWEI_APP_ID" \
  --data-urlencode "fileName=release.apk" \
  --data-urlencode "contentLength=$SIZE" \
  --data-urlencode "suffix=apk" \
  -H "client_id: $HUAWEI_CLIENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")"
assert_ret_ok "$URL_RESP" "获取上传地址"
UPLOAD_URL="$(printf '%s' "$URL_RESP" | jq -r '.urlInfo.url // empty')"
OBJECT_ID="$(printf '%s' "$URL_RESP" | jq -r '.urlInfo.objectId // empty')"
[[ -n "$UPLOAD_URL" && -n "$OBJECT_ID" ]] || { echo "✗ 未拿到上传地址/objectId:$URL_RESP" >&2; exit 1; }

echo "▸ ③ 上传 APK 到 OBS($SIZE bytes)"
# 回放接口返回的签名 header(Authorization / x-amz-* / Host / user-agent 等),
# Content-Type 强制 application/octet-stream(与官方客户端实际行为一致)。
OBS_HEADERS=()
while IFS= read -r h; do
  [[ -n "$h" ]] && OBS_HEADERS+=(-H "$h")
done < <(printf '%s' "$URL_RESP" | jq -r \
  '.urlInfo.headers | to_entries[] | select(.key|ascii_downcase != "content-type") | "\(.key): \(.value)"')
OBS_CODE="$(curl -sS -o /dev/null -w '%{http_code}' -X PUT "$UPLOAD_URL" \
  "${OBS_HEADERS[@]}" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @"$APK")"
[[ "$OBS_CODE" == "200" ]] || { echo "✗ OBS 上传失败(HTTP $OBS_CODE)" >&2; exit 1; }

echo "▸ ④ 绑定已上传文件"
FILEINFO_RESP="$(curl -fsS -X PUT "$API/publish/v2/app-file-info?appId=$HUAWEI_APP_ID" \
  -H "client_id: $HUAWEI_CLIENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc --arg url "$OBJECT_ID" \
        '{fileType:5, files:[{fileName:"release.apk", fileDestUrl:$url}]}')")"
assert_ret_ok "$FILEINFO_RESP" "绑定文件"

echo "▸ ⑤ 提交发布"
SUBMIT_URL="$API/publish/v2/app-submit?appId=$HUAWEI_APP_ID"
if [[ -n "$REMARK" ]]; then
  len="${#REMARK}"
  if (( len < 3 || len > 500 )); then
    echo "✗ 更新说明长度需在 3–500 字符(当前 $len)" >&2; exit 1
  fi
  SUBMIT_URL="$SUBMIT_URL&remark=$(jq -rn --arg s "$REMARK" '$s|@uri')"
fi
[[ -n "$RELEASE_TYPE" ]] && SUBMIT_URL="$SUBMIT_URL&releaseType=$RELEASE_TYPE"
SUBMIT_RESP="$(curl -fsS -X POST "$SUBMIT_URL" \
  -H "client_id: $HUAWEI_CLIENT_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")"
assert_ret_ok "$SUBMIT_RESP" "提交发布"

echo "✅ 已提交华为 AppGallery 发布(appId=$HUAWEI_APP_ID)。到 AGC 控制台查看审核状态。"
