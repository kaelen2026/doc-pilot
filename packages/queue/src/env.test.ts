import { afterEach, describe, expect, it, vi } from "vitest";

// queueEnv 在 import 期读取 process.env,故用 resetModules + 动态 import 重新求值,
// 而非 vi.mock 劫持模块。
async function loadQueueEnv() {
  vi.resetModules();
  const { queueEnv } = await import("./env");
  return queueEnv;
}

describe("queueEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("REDIS_URL 已设置时使用该连接串", async () => {
    vi.stubEnv("REDIS_URL", "redis://redis.internal:6380");

    const queueEnv = await loadQueueEnv();

    expect(queueEnv.redisUrl).toBe("redis://redis.internal:6380");
  });

  it("REDIS_URL 缺省时回退本地串,保证 import 安全", async () => {
    vi.stubEnv("REDIS_URL", undefined);

    const queueEnv = await loadQueueEnv();

    expect(queueEnv.redisUrl).toBe("redis://localhost:6379");
  });
});
