import { metrics as otelMetrics } from "@opentelemetry/api";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { MeterProvider } from "@opentelemetry/sdk-metrics";
import { observabilityEnv } from "./env";
import { logger } from "./logger";

export interface TelemetryHandle {
  shutdown(): Promise<void>;
}

/**
 * 启动 Metrics 采集:注册全局 MeterProvider 并用 Prometheus Exporter 暴露 /metrics。
 * 端口来自 opts.port 或 METRICS_PORT;两者都缺省则不启动(dev/CI/测试零开销,
 * 所有 metrics 门面退化为 no-op)。必须在进程启动早期调用,晚于它创建的仪表才有效。
 */
export function startMetrics(opts: { serviceName: string; port?: number }): TelemetryHandle | null {
  const port = opts.port ?? observabilityEnv.metricsPort();
  if (!port) {
    logger.info("metrics.disabled", { serviceName: opts.serviceName });
    return null;
  }

  const exporter = new PrometheusExporter({ port });
  const provider = new MeterProvider({ readers: [exporter] });
  otelMetrics.setGlobalMeterProvider(provider);
  logger.info("metrics.server.started", { serviceName: opts.serviceName, port, path: "/metrics" });

  return {
    async shutdown() {
      await provider.shutdown();
    },
  };
}
