import { ACCOUNT_PURGE, RECONCILE } from "@doc-pilot/contracts";
import {
  errToLog,
  jobMetrics,
  logger,
  registerQueueDepthGauge,
  startMetrics,
} from "@doc-pilot/observability";
import {
  createRedisConnection,
  getDocumentProcessingQueue,
  getMaintenanceQueue,
  JOB_NAMES,
  QUEUE_NAMES,
  RedisNotificationBus,
} from "@doc-pilot/queue";
import { Worker } from "bullmq";
import { workerEnv } from "./env";
import { startOutboxPublisher } from "./outbox/publisher";
import { createDocumentProcessor } from "./processors/document.processor";
import { createPurgeAccountProcessor } from "./purge-account/purge-account.processor";
import { workerApnsClient } from "./push/apns";
import { sendBadgePush } from "./push/badge";
import { createReconcileProcessor } from "./reconcile/reconcile.processor";
import { type CreatedNotification, countUnread } from "./repository/document.repository";
import { deleteInvalidTokens, listDevicesByUserId } from "./repository/push.repository";

// Metrics:配置 METRICS_PORT 时暴露 Prometheus /metrics;未配置则 no-op。
startMetrics({ serviceName: "doc-pilot-worker" });

// BullMQ 建议 Worker（阻塞式）与 Queue 使用各自的连接。
const workerConnection = createRedisConnection();
const publisherConnection = createRedisConnection();
const metricsConnection = createRedisConnection();
// maintenance:阻塞式 Worker 单独连接;Queue 客户端(调度 + 重入队)共用一条非阻塞连接。
const maintenanceWorkerConnection = createRedisConnection();
const maintenanceQueueConnection = createRedisConnection();

// 通知脉冲:Worker 只发布(不订阅)。发布连接单独一条,提交终态后推给在线的 SSE 连接。
const notificationPublisherConnection = createRedisConnection();
const notificationBus = new RedisNotificationBus({
  publisher: notificationPublisherConnection,
  createSubscriber: createRedisConnection,
});

// 离线角标推送:APNS 已配置才接线,否则整条通路为 undefined(处理器据此跳过,不影响处理)。
const apnsClient = workerApnsClient();
const pushBadge = apnsClient
  ? (notification: CreatedNotification, workspaceId: string) =>
      sendBadgePush(
        { client: apnsClient, listDevices: listDevicesByUserId, countUnread, deleteInvalidTokens },
        {
          workspaceId,
          userId: notification.userId,
          title: notification.title,
          body: notification.body,
        },
      )
  : undefined;

const worker = new Worker(
  QUEUE_NAMES.documentProcessing,
  createDocumentProcessor({ notificationBus, pushBadge }),
  {
    connection: workerConnection,
    concurrency: workerEnv.concurrency,
  },
);

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
  intervalMs: workerEnv.outboxPollIntervalMs,
});

// 自动对账(runbooks/failure-recovery.md §35):maintenance 队列上的周期性任务。
// reconcile 会检查/重新入队 document-processing 的 Job,故传入一个该队列的客户端。
const reconcileProcessingQueue = getDocumentProcessingQueue(maintenanceQueueConnection);
const maintenanceQueue = getMaintenanceQueue(maintenanceQueueConnection);
// maintenance 队列现承载两类周期任务(reconcile + 账户清理),按 job.name 分发到各自处理器。
const reconcileProcessor = createReconcileProcessor(reconcileProcessingQueue);
const purgeAccountProcessor = createPurgeAccountProcessor();
const maintenanceWorker = new Worker(
  QUEUE_NAMES.maintenance,
  (job) => (job.name === JOB_NAMES.purgeAccount ? purgeAccountProcessor() : reconcileProcessor()),
  { connection: maintenanceWorkerConnection, concurrency: 1 },
);
maintenanceWorker.on("completed", (job) => {
  jobMetrics.completed((job.finishedOn ?? 0) - (job.processedOn ?? 0));
});
maintenanceWorker.on("failed", (job, err) => {
  jobMetrics.failed();
  logger.error("worker.maintenance.failed", { jobId: job?.id, message: err.message });
});

// 调度周期性 reconcile(repeatable;BullMQ 按 name+repeat 去重,多实例/重启不会重复调度)。
void maintenanceQueue
  .add(
    JOB_NAMES.reconcile,
    {},
    { repeat: { every: RECONCILE.intervalMs }, removeOnComplete: true, removeOnFail: 100 },
  )
  .then(() => logger.info("reconcile.scheduled", { intervalMs: RECONCILE.intervalMs }))
  .catch((err) => logger.error("reconcile.schedule_failed", errToLog(err)));

// 调度周期性账户清理(注销冷静期到期 → 硬删除)。同一 maintenance 队列,按 name 去重。
void maintenanceQueue
  .add(
    JOB_NAMES.purgeAccount,
    {},
    { repeat: { every: ACCOUNT_PURGE.intervalMs }, removeOnComplete: true, removeOnFail: 100 },
  )
  .then(() => logger.info("account_purge.scheduled", { intervalMs: ACCOUNT_PURGE.intervalMs }))
  .catch((err) => logger.error("account_purge.schedule_failed", errToLog(err)));

logger.info("worker.started", {
  queues: [QUEUE_NAMES.documentProcessing, QUEUE_NAMES.maintenance],
});

async function shutdown(signal: string): Promise<void> {
  logger.info("worker.shutdown", { signal });
  await stopPublisher();
  await worker.close();
  await maintenanceWorker.close();
  await maintenanceQueue.close();
  await reconcileProcessingQueue.close();
  await metricsQueue.close();
  await notificationBus.close();
  await workerConnection.quit();
  await publisherConnection.quit();
  await metricsConnection.quit();
  await maintenanceWorkerConnection.quit();
  await maintenanceQueueConnection.quit();
  await notificationPublisherConnection.quit();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
