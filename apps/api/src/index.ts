import { logger, startMetrics } from "@doc-pilot/observability";
import { serve } from "@hono/node-server";
import IORedis from "ioredis";
import { createApp } from "./app";
import { RedisRateLimiter } from "./shared/rate-limit";

const port = Number(process.env.API_PORT ?? 3001);

// Metrics:配置 METRICS_PORT 时暴露 Prometheus /metrics;未配置则 no-op。
startMetrics({ serviceName: "doc-pilot-api" });

// 限流用 Redis 连接(与 BullMQ 分开,使用默认重试策略)。
const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379");
const app = createApp({ rateLimiter: new RedisRateLimiter(redis) });

serve({ fetch: app.fetch, port }, (info) => {
  logger.info("api.listening", { port: info.port });
});
