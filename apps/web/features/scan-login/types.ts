/** /device/code 响应(snake_case)归一化后的取码结果。 */
export interface DeviceCodeData {
  /** 轮询密钥,web 用它换会话(不展示)。 */
  deviceCode: string;
  /** 展示给用户的短码(二维码扫不动时可读出)。 */
  userCode: string;
  /** 编入二维码的深链(docpilot://device-login?user_code=…),= 插件 verification_uri_complete。 */
  verificationUriComplete: string;
  /** 轮询间隔(秒),以服务端返回为准,避免触发 slow_down。 */
  intervalSec: number;
  /** 用户码有效期(秒),用于「二维码已过期」提示。 */
  expiresInSec: number;
}
