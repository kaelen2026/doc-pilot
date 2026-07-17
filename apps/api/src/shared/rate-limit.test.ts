import type { RateLimitRule } from "@doc-pilot/contracts";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { InMemoryRateLimiter, rateLimit } from "./rate-limit";
import type { AppEnv } from "./types";

const RULE: RateLimitRule = { capacity: 2, refillTokens: 2, intervalMs: 60_000 };

function appWith(limiter: InMemoryRateLimiter) {
  const app = new Hono<AppEnv>();
  // 模拟 guard 之后:注入固定用户。
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1", email: "a@b.com", name: "A" });
    await next();
  });
  app.use(
    "/ask",
    rateLimit({ limiter, rule: RULE, name: "ask", subject: (c) => c.get("user")?.id ?? null }),
  );
  app.post("/ask", (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimit 中间件", () => {
  it("容量内放行,超出返回 429 + Retry-After", async () => {
    const app = appWith(new InMemoryRateLimiter(() => 1_000_000));

    const first = await app.request("/ask", { method: "POST" });
    expect(first.status).toBe(200);
    expect(first.headers.get("RateLimit-Limit")).toBe("2");
    expect(first.headers.get("RateLimit-Remaining")).toBe("1");

    const second = await app.request("/ask", { method: "POST" });
    expect(second.status).toBe(200);
    expect(second.headers.get("RateLimit-Remaining")).toBe("0");

    const blocked = await app.request("/ask", { method: "POST" });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    const body = (await blocked.json()) as { error: string };
    expect(body.error).toBe("rate_limited");
  });

  it("不同主体各自独立计数", async () => {
    const limiter = new InMemoryRateLimiter(() => 1_000_000);
    await limiter.consume("rl:ask:user-1", RULE);
    await limiter.consume("rl:ask:user-1", RULE);
    const blocked = await limiter.consume("rl:ask:user-1", RULE);
    expect(blocked.allowed).toBe(false);

    const other = await limiter.consume("rl:ask:user-2", RULE);
    expect(other.allowed).toBe(true);
  });

  it("subject 返回 null 时跳过限流", async () => {
    const app = new Hono<AppEnv>();
    app.use(
      "/ask",
      rateLimit({
        limiter: new InMemoryRateLimiter(),
        rule: RULE,
        name: "ask",
        subject: () => null,
      }),
    );
    app.post("/ask", (c) => c.json({ ok: true }));

    for (let i = 0; i < 5; i++) {
      const res = await app.request("/ask", { method: "POST" });
      expect(res.status).toBe(200);
    }
  });
});
