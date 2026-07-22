/**
 * 扫码登录(iOS 扫码 → web 登录)的稳定契约。
 *
 * 底层复用 Better Auth 的 device-authorization 插件(OAuth 2.0 Device Authorization Grant,
 * RFC 8628):web 调 `/api/auth/device/code` 拿 user_code + device_code + verification_uri_complete
 * (编入二维码),随后按返回的 interval 轮询 `/api/auth/device/token`;iOS 扫码解析出 user_code,
 * 已登录态调 `/api/auth/device/approve` 批准,web 下一次轮询即拿到自己的独立会话。
 *
 * 三端(web / api / iOS)共用此处常量,避免 scheme、client_id、grant_type 等魔法串静默漂移
 * (参照 chat.ts / notifications.ts)。
 */

/** web 作为设备授权流程的首方客户端标识;API 的 validateClient 只放行它。 */
export const SCAN_LOGIN_CLIENT_ID = "docpilot-web";

/**
 * 二维码编码的深链 scheme(= 插件 verificationUri)。iOS 扫码后据此解析 user_code。
 * `docpilot://` 已列入 auth 的 trustedOrigins。
 */
export const SCAN_LOGIN_URI = "docpilot://device-login";

/** verification_uri_complete 承载用户码的 query 参数名(由 Better Auth 固定为 user_code)。 */
export const SCAN_LOGIN_USER_CODE_PARAM = "user_code";

/** OAuth 设备流 grant_type(RFC 8628 §3.4),web 轮询 /device/token 时提交。 */
export const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

/** 用户码/设备码有效期(秒),与 auth 插件 expiresIn 对齐(2 分钟)。前端据此提示「二维码已过期」。 */
export const SCAN_LOGIN_EXPIRES_SEC = 120;

/** 默认轮询间隔(秒),前端兜底用;实际以 /device/code 返回的 interval 为准(避免触发 slow_down)。 */
export const SCAN_LOGIN_POLL_INTERVAL_SEC = 2;

/**
 * web 轮询 /device/token 的 RFC 8628 错误码。
 * - authorization_pending:用户尚未批准,继续等待。
 * - slow_down:轮询过快,应加大间隔。
 * - access_denied:用户在手机上拒绝。
 * - expired_token:设备码/用户码已过期,需重新生成二维码。
 */
export const DEVICE_TOKEN_ERRORS = {
  authorizationPending: "authorization_pending",
  slowDown: "slow_down",
  accessDenied: "access_denied",
  expiredToken: "expired_token",
} as const;
export type DeviceTokenError = (typeof DEVICE_TOKEN_ERRORS)[keyof typeof DEVICE_TOKEN_ERRORS];

/**
 * 拼装二维码承载的深链(= 插件返回的 verification_uri_complete 形态)。
 * 与 Better Auth 服务端的 buildVerificationUris 同构(new URL + searchParams.set),保持一致。
 */
export function buildScanLoginUri(userCode: string): string {
  const url = new URL(SCAN_LOGIN_URI);
  url.searchParams.set(SCAN_LOGIN_USER_CODE_PARAM, userCode);
  return url.toString();
}

/**
 * 从 iOS 扫到的字符串解析出 user_code。
 * 接受完整深链(docpilot://device-login?user_code=XXXX),也兼容裸用户码;无法识别时返回 null。
 */
export function parseScanLoginUserCode(scanned: string): string | null {
  const raw = scanned.trim();
  if (!raw) return null;
  try {
    const code = new URL(raw).searchParams.get(SCAN_LOGIN_USER_CODE_PARAM);
    return code?.trim() ? code.trim() : null;
  } catch {
    // 非 URL:视为裸用户码。仅接受设备流字符集,避免把任意文本误当作码。
    return /^[A-Z0-9-]{4,}$/i.test(raw) ? raw : null;
  }
}
