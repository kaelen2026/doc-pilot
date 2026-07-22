import { db, queryClient } from "@doc-pilot/database";
import { session, user } from "@doc-pilot/database/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * /scan-login/adopt 集成测:把 device/token 返回的 bearer access_token(= 一条真实 session 的
 * token)换成浏览器的 HttpOnly cookie 会话(补 device-authorization 不种 cookie 的缺口,见 ADR-011)。
 * 需真实 Postgres。钉住不变量:合法 token → 200 且带 Set-Cookie(better-auth.session_token);
 * 无效 token → 401 且不种 cookie。
 */
const app = createApp();
const runId = `adopt-it-${Date.now()}`;
const userId = `${runId}-u`;
const validToken = `${runId}-token`;

beforeAll(async () => {
  await db.insert(user).values({
    id: userId,
    name: "Adopt",
    email: `${userId}@test.local`,
    emailVerified: true,
  });
  await db.insert(session).values({
    id: `${runId}-s`,
    token: validToken,
    userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
  });
});

afterAll(async () => {
  await db.delete(session).where(eq(session.userId, userId));
  await db.delete(user).where(eq(user.id, userId));
  await queryClient.end({ timeout: 5 });
});

async function adopt(token: string) {
  return app.request("/api/auth/scan-login/adopt", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ token }),
  });
}

describe("POST /api/auth/scan-login/adopt", () => {
  it("合法 token → 200 且种上 session cookie", async () => {
    const res = await adopt(validToken);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("better-auth.session_token");
  });

  it("无效 token → 401 且不种 cookie", async () => {
    const res = await adopt("not-a-real-token");
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
