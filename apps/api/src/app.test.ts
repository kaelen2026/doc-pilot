import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("health", () => {
  it("GET /health returns ok", async () => {
    const app = createApp();
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe("ok");
    expect(body.service).toBe("api");
  });
});

describe("受保护路由的鉴权门禁", () => {
  // /me 与其子路由都必须过 requireAuth。曾漏挂 `/me/*`,导致 /me/usage 绕过鉴权并 500。
  // 未带会话 cookie 时 getSession 返回 null,应统一 401(不落到 handler)。
  it.each(["/me", "/me/usage"])("未认证访问 %s 返回 401", async (path) => {
    const app = createApp();
    const res = await app.request(path);
    expect(res.status).toBe(401);
  });
});
