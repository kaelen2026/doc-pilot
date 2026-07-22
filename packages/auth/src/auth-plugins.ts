import { SCAN_LOGIN_CLIENT_ID, SCAN_LOGIN_URI } from "@doc-pilot/contracts";
import { bearer, deviceAuthorization, emailOTP, oneTap } from "better-auth/plugins";
import { scanLoginCookie } from "./scan-login-cookie";

export function createAuthPlugins(deps: {
  sendOtpEmail: (email: string, otp: string, type: string) => Promise<void>;
  /** Google 凭据齐备时挂上 One Tap;clientId 复用 socialProviders.google 的配置。 */
  googleOneTap?: boolean;
}) {
  return [
    emailOTP({
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp, type }) {
        try {
          await deps.sendOtpEmail(email, otp, type);
        } catch (err) {
          console.error("[auth] failed to send OTP email:", err);
        }
      },
    }),
    // Apple 原生客户端从登录响应的 set-auth-token 取签名 Session Token，存入 Keychain。
    // Web 不启用 bearer client plugin，继续只使用 HttpOnly Cookie。
    bearer({ requireSignature: true }),
    // 扫码登录(iOS 扫码 → web 登录)底座:OAuth 2.0 Device Authorization Grant(RFC 8628)。
    // web 调 /device/code 取 user_code(编入二维码)并轮询 /device/token;iOS 已登录态先经
    // GET /device 认领再 /device/approve 批准;/device/token 随后返回 bearer access_token
    // (它不给浏览器种 cookie),web 再调 /scan-login/adopt 换取 cookie 会话(见 scan-login-cookie.ts)。
    deviceAuthorization({
      // 二维码短生命周期:2 分钟即过期,降低泄露窗口(默认 30m 对扫码场景过长)。
      expiresIn: "2m",
      // web 轮询间隔;返回给客户端,快于此值会被判 slow_down。
      interval: "2s",
      // verification_uri_complete 形如 docpilot://device-login?user_code=XXXX,供 iOS 扫码解析。
      verificationUri: SCAN_LOGIN_URI,
      // 仅放行首方 web 客户端,拒绝任意 client_id 发起设备流。
      validateClient: (clientId) => clientId === SCAN_LOGIN_CLIENT_ID,
    }),
    // 把 device/token 返回的 bearer access_token 换成 web 的 HttpOnly cookie 会话。
    scanLoginCookie(),
    // Google One Tap(Chrome 一步登录):暴露 /one-tap/callback 校验 GSI 返回的 idToken。
    // 仅在 Google 配置齐备时挂载,未配置则不注册,避免暴露一个必然失败的端点。
    ...(deps.googleOneTap ? [oneTap()] : []),
  ];
}
