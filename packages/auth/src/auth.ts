import { db, schema } from "@doc-pilot/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { sendOtpEmail } from "./mailer";
import { createPersonalWorkspace } from "./workspace";

/**
 * Better Auth 服务端实例（ADR：认证使用 Better Auth）。
 * - 邮箱验证码登录（emailOTP）；未注册邮箱首次登录即注册。
 * - Drizzle(postgres.js) 适配器，表名用默认单数：user/session/account/verification。
 * - user.create.after 钩子自动创建个人 workspace（见最终验收 #2）。
 */
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-me",
  trustedOrigins: ["http://localhost:3000", "http://localhost:3001"],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  plugins: [
    emailOTP({
      overrideDefaultEmailVerification: true,
      async sendVerificationOTP({ email, otp, type }) {
        // 本地开发直接打印，便于在无邮箱客户端时取码；同时投递到 SMTP(Mailpit)。
        console.log(`[auth] OTP for ${email} (${type}): ${otp}`);
        try {
          await sendOtpEmail(email, otp, type);
        } catch (err) {
          console.error("[auth] failed to send OTP email:", err);
        }
      },
    }),
  ],
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
