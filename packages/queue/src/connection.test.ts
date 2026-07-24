import { describe, expect, it } from "vitest";
import { createRedisConnection } from "./connection";
import { queueEnv } from "./env";

// 只构造实例并立即断开,不等待任何 Redis 命令——测试不要求本地有 Redis 在跑。
describe("createRedisConnection", () => {
  it("连接的 maxRetriesPerRequest 为 null(BullMQ 的硬性要求)", () => {
    const connection = createRedisConnection();
    connection.on("error", () => {}); // 无 Redis 时的连接错误不应打爆测试进程。

    try {
      expect(connection.options.maxRetriesPerRequest).toBeNull();
    } finally {
      connection.disconnect();
    }
  });

  it("连接目标来自 env.ts 集中的 redisUrl,不另写死", () => {
    const url = new URL(queueEnv.redisUrl);
    const connection = createRedisConnection();
    connection.on("error", () => {});

    try {
      expect(connection.options.host).toBe(url.hostname);
      expect(connection.options.port).toBe(Number(url.port || "6379"));
    } finally {
      connection.disconnect();
    }
  });
});
