/**
 * 移动端推送(APNS)的稳定契约:平台、环境、令牌与测试推送文案的边界。
 * API 校验、Web 管理后台表单、iOS 客户端三方引用,避免魔法字符串与上限漂移(参照 notifications.ts)。
 *
 * 说明:设备令牌注册按用户身份键控(见 DB push_devices 表),不做 workspace 作用域。
 * environment 必须与 App 的 aps-environment entitlement 一致,否则 APNS 直接 BadDeviceToken。
 */

/** 推送平台。VARCHAR + 应用层校验,不用 PG ENUM。 */
export const PUSH_PLATFORM = {
  ios: "ios",
  android: "android",
} as const;
export type PushPlatform = (typeof PUSH_PLATFORM)[keyof typeof PUSH_PLATFORM];

/** APNS 环境:开发/调试构建用 sandbox,发布构建用 production。 */
export const PUSH_ENVIRONMENT = {
  sandbox: "sandbox",
  production: "production",
} as const;
export type PushEnvironment = (typeof PUSH_ENVIRONMENT)[keyof typeof PUSH_ENVIRONMENT];

/**
 * 设备令牌(十六进制字符串)长度边界。传统 APNS 令牌为 32 字节=64 hex;较新令牌可更长,
 * 故上限放宽到 400,只做防御性校验(拦空串/超长/非 hex),不精确绑定某一长度。
 */
export const PUSH_DEVICE_TOKEN = {
  minLength: 32,
  maxLength: 400,
} as const;

/** FCM registration token 边界。token 大小写敏感,不得像 APNS token 一样转小写。 */
export const FCM_DEVICE_TOKEN = {
  minLength: 32,
  maxLength: 4096,
} as const;

/** 管理后台测试推送的文案上限(防御异常大的输入)。 */
export const PUSH_TEST_MESSAGE = {
  titleMax: 120,
  bodyMax: 400,
} as const;
