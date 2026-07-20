// 本包唯一读取 process.env 的地方。
// 这两项都在「调用时」求值而非模块加载时:日志级别每条日志实时读取(可运行时切换、
// 便于测试注入),metrics 端口在 startMetrics 调用时读取。故以函数暴露,保持原有语义。
export const observabilityEnv = {
  /** 日志级别(小写);每次调用实时读取 process.env(见 logger.ts)。 */
  logLevel: (): string => (process.env.LOG_LEVEL ?? "info").toLowerCase(),
  /** Prometheus 抓取端口;0 表示不启用 metrics。 */
  metricsPort: (): number => Number(process.env.METRICS_PORT ?? 0),
} as const;
