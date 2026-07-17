import { Worker } from "bullmq";
import IORedis from "ioredis";
import { processDocumentJob } from "./processors/document.processor";

const QUEUE_NAME = "document-processing";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  // BullMQ 要求 worker 连接关闭该重试上限。
  maxRetriesPerRequest: null,
});

const worker = new Worker(QUEUE_NAME, processDocumentJob, {
  connection,
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
});

worker.on("completed", (job) => console.log(`[worker] completed ${job.id}`));
worker.on("failed", (job, err) => console.error(`[worker] failed ${job?.id}: ${err.message}`));

console.log(`[worker] listening on queue "${QUEUE_NAME}"`);

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received, shutting down...`);
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
