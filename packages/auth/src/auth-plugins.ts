import { bearer, emailOTP } from "better-auth/plugins";

export function createAuthPlugins(deps: {
  sendOtpEmail: (email: string, otp: string, type: string) => Promise<void>;
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
  ];
}
