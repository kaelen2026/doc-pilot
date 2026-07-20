import IORedis from "ioredis";
import { queueEnv } from "./env";

/**
 * 创建 BullMQ 用的 Redis 连接。BullMQ 要求 maxRetriesPerRequest=null。
 */
export function createRedisConnection(): IORedis {
  return new IORedis(queueEnv.redisUrl, {
    maxRetriesPerRequest: null,
  });
}

export type { Redis } from "ioredis";
