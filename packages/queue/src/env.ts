// 本包唯一读取 process.env 的地方。BullMQ / 限流用的 Redis 连接串集中于此。
export const queueEnv = {
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
} as const;
