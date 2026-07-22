import { bearer, emailOTP, oneTap } from "better-auth/plugins";

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
    // Google One Tap(Chrome 一步登录):暴露 /one-tap/callback 校验 GSI 返回的 idToken。
    // 仅在 Google 配置齐备时挂载,未配置则不注册,避免暴露一个必然失败的端点。
    ...(deps.googleOneTap ? [oneTap()] : []),
  ];
}
