import { metrics } from "@opentelemetry/api";
import { MeterProvider } from "@opentelemetry/sdk-metrics";
import { beforeAll, describe, expect, it } from "vitest";
import { aiMetrics, httpMetrics, jobMetrics, ragMetrics, sseGauge } from "./metrics";

// 注册真实 MeterProvider(无 reader,不起服务器)后调用各门面,
// 走真实仪表的 record/add 路径,验证不抛错(覆盖惰性仪表与标签形状)。
beforeAll(() => {
  metrics.setGlobalMeterProvider(new MeterProvider());
});

describe("metrics 门面", () => {
  it("httpMetrics.record 正常执行", () => {
    expect(() =>
      httpMetrics.record({ method: "GET", route: "/documents", status: 200 }, 12),
    ).not.toThrow();
    expect(() => httpMetrics.record({ method: "POST", route: "/x", status: 500 }, 5)).not.toThrow();
  });

  it("aiMetrics.recordTrace 成功/失败两路均可", () => {
    expect(() =>
      aiMetrics.recordTrace({
        capability: "answer",
        provider: "anthropic",
        model: "claude-opus-4-8",
        ok: true,
        latencyMs: 300,
        usage: { inputTokens: 10, outputTokens: 20, costMicros: 150 },
      }),
    ).not.toThrow();
    expect(() =>
      aiMetrics.recordTrace({
        capability: "answer",
        provider: "anthropic",
        model: "claude-opus-4-8",
        ok: false,
        latencyMs: 40,
        errorCode: "AI_INVALID_RESPONSE",
      }),
    ).not.toThrow();
  });

  it("ragMetrics 检索与回答指标", () => {
    expect(() => ragMetrics.retrieval(5, 0.82)).not.toThrow();
    expect(() => ragMetrics.retrieval(0, null)).not.toThrow();
    expect(() =>
      ragMetrics.answer({ citationCount: 3, invalidCitationCount: 0, insufficientEvidence: false }),
    ).not.toThrow();
  });

  it("sseGauge 增减与 jobMetrics", () => {
    expect(() => {
      sseGauge.inc();
      sseGauge.dec();
      jobMetrics.completed(1200, { stage: "parse" });
      jobMetrics.failed();
      jobMetrics.retried();
    }).not.toThrow();
  });
});
