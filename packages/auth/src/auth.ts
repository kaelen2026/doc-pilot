import { db, schema } from "@doc-pilot/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthPlugins } from "./auth-plugins";
import { authEnv } from "./env";
import { sendOtpEmail } from "./mailer";
import { resolveSocialProviders } from "./social";
import { createPersonalWorkspace } from "./workspace";

/**
 * Better Auth 服务端实例（ADR：认证使用 Better Auth）。
 * - 三种入口并存：邮箱验证码（emailOTP，未注册即注册）、邮箱+密码、Google 社交登录
 *   （含 Google One Tap 一步登录，Chrome 内直接弹账号）。
 * - 密码登录写 account 表（credential provider）；社交/One Tap 登录写 account（google provider）；
 *   OTP 仅建 user/session，不写 account。三者都经 user.create.after 建个人 workspace。
 * - Drizzle(postgres.js) 适配器，表名用默认单数：user/session/account/verification。
 */
const socialProviders = resolveSocialProviders(authEnv);

export const auth = betterAuth({
  baseURL: authEnv.baseURL,
  basePath: "/api/auth",
  secret: authEnv.secret,
  trustedOrigins: authEnv.trustedOrigins,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // 邮箱+密码登录；不强制邮箱验证（首注册即登录），与 OTP 首登即注册的体验对齐。
  emailAndPassword: { enabled: true },
  // 仅当 Google 凭据齐备时才注册该 provider（见 social.ts）。
  socialProviders,
  // Google 配置齐备时同时挂上 One Tap;其 clientId 复用上面的 socialProviders.google。
  plugins: createAuthPlugins({ sendOtpEmail, googleOneTap: Boolean(socialProviders.google) }),
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          const name = createdUser.name?.trim() ? `${createdUser.name} 的空间` : "我的空间";
          await createPersonalWorkspace({ userId: createdUser.id, name });
        },
      },
    },
  },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
