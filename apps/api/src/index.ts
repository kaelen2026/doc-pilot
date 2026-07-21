import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { db } from "@doc-pilot/database";
import { logger, startMetrics } from "@doc-pilot/observability";
import { RedisNotificationBus } from "@doc-pilot/queue";
import { bucket, s3 } from "@doc-pilot/storage";
import { serve } from "@hono/node-server";
import { sql } from "drizzle-orm";
import IORedis from "ioredis";
import { createApp } from "./app";
import { apiEnv } from "./env";
import { RedisRateLimiter } from "./shared/rate-limit";

const port = apiEnv.port;

// Metrics:配置 METRICS_PORT 时暴露 Prometheus /metrics;未配置则 no-op。
startMetrics({ serviceName: "doc-pilot-api" });

// 限流用 Redis 连接(与 BullMQ 分开,使用默认重试策略)。
const redis = new IORedis(apiEnv.redisUrl);
// 通知脉冲:发布复用限流连接;订阅连接进入 subscribe 模式会被独占,故由 bus 按需另开一条。
const notificationBus = new RedisNotificationBus({
  publisher: redis,
  createSubscriber: () => new IORedis(apiEnv.redisUrl),
});
const app = createApp({
  rateLimiter: new RedisRateLimiter(redis),
  notificationBus,
  readiness: {
    database: async () => {
      await db.execute(sql`select 1`);
    },
    redis: async () => {
      await redis.ping();
    },
    storage: async () => {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    },
  },
});

serve({ fetch: app.fetch, port }, (info) => {
  logger.info("api.listening", { port: info.port });
});
