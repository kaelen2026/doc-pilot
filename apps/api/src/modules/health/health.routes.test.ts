import { describe, expect, it, vi } from "vitest";
import { createHealthRoutes } from "./health.routes";

describe("readiness", () => {
  it("全部依赖可用时返回 ready", async () => {
    const app = createHealthRoutes({
      database: vi.fn().mockResolvedValue(undefined),
      redis: vi.fn().mockResolvedValue(undefined),
      storage: vi.fn().mockResolvedValue(undefined),
    });
    const response = await app.request("/ready");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ready",
      checks: { database: "ok", redis: "ok", storage: "ok" },
    });
  });

  it("任一依赖失败时返回 503 且不泄露异常详情", async () => {
    const app = createHealthRoutes({
      database: vi.fn().mockRejectedValue(new Error("password=secret")),
      redis: vi.fn().mockResolvedValue(undefined),
      storage: vi.fn().mockResolvedValue(undefined),
    });
    const response = await app.request("/ready");
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain('"database":"failed"');
    expect(body).not.toContain("secret");
  });
});
