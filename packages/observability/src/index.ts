// 纯 re-export barrel,无任何逻辑——已在 test:coverage 中排除
// (与 apps/api、apps/worker 排除 src/index.ts 同口径:排除的是接线,不是逻辑)。
export {
  createLogger,
  errToLog,
  type LogFields,
  type Logger,
  type LogLevel,
  logger,
} from "./logger";
export {
  type AiTraceLike,
  aiMetrics,
  httpMetrics,
  jobMetrics,
  ragMetrics,
  registerQueueDepthGauge,
  sseGauge,
} from "./metrics";
export { startMetrics, type TelemetryHandle } from "./telemetry";
export { withSpan } from "./tracing";
