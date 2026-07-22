import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";

/**
 * 扫码登录的「会话领取」端点(补 device-authorization 的缺口)。
 *
 * device-authorization 的 /device/token 是 OAuth token 端点:批准后只返回 bearer
 * `access_token`(= 新建 session 的 raw token),**不给浏览器种 cookie**。而 web 是
 * cookie 认证,拿到 token 仍是未登录态(见 ADR-011 修订)。
 *
 * 本端点接收该 token,按它查出 session 并 setSessionCookie 种上签名 HttpOnly cookie —— 逻辑
 * 与 oneTimeToken.verify 的 findSession + setSessionCookie 同构。token 只会下发给「已获批准」
 * 的合法轮询方,且 token 本身即完整会话凭据,故领取不引入额外风险。
 */
export function scanLoginCookie() {
  return {
    id: "scan-login-cookie",
    endpoints: {
      adoptScanLoginSession: createAuthEndpoint(
        "/scan-login/adopt",
        {
          method: "POST",
          body: z.object({
            token: z.string().meta({ description: "device/token 返回的 access_token" }),
          }),
        },
        async (ctx) => {
          const session = await ctx.context.internalAdapter.findSession(ctx.body.token);
          if (!session) {
            throw ctx.error("UNAUTHORIZED", { message: "Invalid session token" });
          }
          if (new Date(session.session.expiresAt) < new Date()) {
            throw ctx.error("UNAUTHORIZED", { message: "Session expired" });
          }
          await setSessionCookie(ctx, session);
          return ctx.json({ success: true });
        },
      ),
    },
  };
}
