import type { Attributes, Span } from "@opentelemetry/api";
import { SpanStatusCode, trace } from "@opentelemetry/api";

/**
 * Trace 门面(cross-cutting.md §29.1)。基于 OpenTelemetry Trace API:未注册
 * TracerProvider 时 startActiveSpan 返回 non-recording span(dev/CI 零成本)。
 * 生产接入 OTLP 导出器(如通过 `--require @opentelemetry/auto-instrumentations-node`
 * 或注册 NodeTracerProvider)后,以下 span 自动成树上报。
 */
function tracer() {
  return trace.getTracer("doc-pilot", "0.1.0");
}

/** 在一个 span 内执行 fn。异常会记录到 span 并置为 ERROR 状态后重抛。 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T> | T,
  attributes?: Attributes,
): Promise<T> {
  return tracer().startActiveSpan(name, async (span) => {
    if (attributes) {
      span.setAttributes(attributes);
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.recordException(err as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}
