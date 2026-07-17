import {
  jobMetrics,
  logger,
  registerQueueDepthGauge,
  startMetrics,
} from "@doc-pilot/observability";
import { createRedisConnection, getDocumentProcessingQueue, QUEUE_NAMES } from "@doc-pilot/queue";
import { Worker } from "bullmq";
import { startOutboxPublisher } from "./outbox/publisher";
import { processDocumentJob } from "./processors/document.processor";

// Metrics:配置 METRICS_PORT 时暴露 Prometheus /metrics;未配置则 no-op。
startMetrics({ serviceName: "doc-pilot-worker" });

// BullMQ 建议 Worker（阻塞式）与 Queue 使用各自的连接。
const workerConnection = createRedisConnection();
const publisherConnection = createRedisConnection();
const metricsConnection = createRedisConnection();

const worker = new Worker(QUEUE_NAMES.documentProcessing, processDocumentJob, {
  connection: workerConnection,
  concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
});

// queue_depth(§29.2):Prometheus 抓取时读取 waiting + active + delayed。
const metricsQueue = getDocumentProcessingQueue(metricsConnection);
registerQueueDepthGauge(QUEUE_NAMES.documentProcessing, async () => {
  const counts = await metricsQueue.getJobCounts("waiting", "active", "delayed");
  return (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
});

worker.on("completed", (job) => {
  const durationMs = (job.finishedOn ?? 0) - (job.processedOn ?? 0);
  jobMetrics.completed(durationMs);
  logger.info("worker.job.completed", { jobId: job.id, durationMs });
});
worker.on("failed", (job, err) => {
  const attempts = job?.opts.attempts ?? 1;
  const willRetry = job ? job.attemptsMade < attempts : false;
  if (willRetry) {
    jobMetrics.retried();
  } else {
    jobMetrics.failed();
  }
  logger.error("worker.job.failed", { jobId: job?.id, willRetry, message: err.message });
});

const stopPublisher = startOutboxPublisher({
  connection: publisherConnection,
  intervalMs: Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 2000),
});

logger.info("worker.started", { queue: QUEUE_NAMES.documentProcessing });

async function shutdown(signal: string): Promise<void> {
  logger.info("worker.shutdown", { signal });
  await stopPublisher();
  await worker.close();
  await metricsQueue.close();
  await workerConnection.quit();
  await publisherConnection.quit();
  await metricsConnection.quit();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
