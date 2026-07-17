import IORedis from "ioredis";

/**
 * 创建 BullMQ 用的 Redis 连接。BullMQ 要求 maxRetriesPerRequest=null。
 */
export function createRedisConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}

export type { Redis } from "ioredis";
