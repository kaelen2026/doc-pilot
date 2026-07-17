import { serve } from "@hono/node-server";
import IORedis from "ioredis";
import { createApp } from "./app";
import { RedisRateLimiter } from "./shared/rate-limit";

const port = Number(process.env.API_PORT ?? 3001);

// 限流用 Redis 连接(与 BullMQ 分开,使用默认重试策略)。
const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379");
const app = createApp({ rateLimiter: new RedisRateLimiter(redis) });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});
