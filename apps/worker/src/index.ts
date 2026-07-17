import { createRedisConnection, QUEUE_NAMES } from "@doc-pilot/queue";
import { Worker } from "bullmq";
import { startOutboxPublisher } from "./outbox/publisher";
import { processDocumentJob } from "./processors/document.processor";

// BullMQ 建议 Worker（阻塞式）与 Queue 使用各自的连接。
const workerConnection = createRedisConnection();
const publisherConnection = createRedisConnection();

const worker = new Worker(QUEUE_NAMES.documentProcessing, processDocumentJob, {
  connection: workerConnection,
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
});

worker.on("completed", (job) => console.log(`[worker] completed ${job.id}`));
worker.on("failed", (job, err) => console.error(`[worker] failed ${job?.id}: ${err.message}`));

const stopPublisher = startOutboxPublisher({
  connection: publisherConnection,
  intervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 2000),
});

console.log(`[worker] consuming "${QUEUE_NAMES.documentProcessing}" + outbox publisher running`);

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received, shutting down...`);
  await stopPublisher();
  await worker.close();
  await workerConnection.quit();
  await publisherConnection.quit();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
