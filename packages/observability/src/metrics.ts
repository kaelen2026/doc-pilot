import type { Counter, Meter, UpDownCounter } from "@opentelemetry/api";
import { metrics as otelMetrics } from "@opentelemetry/api";

/**
 * Metrics 门面(cross-cutting.md §29.2)。基于 OpenTelemetry Metrics API:
 * 未注册 MeterProvider 时为 no-op(dev/CI 零成本);startMetrics 注册 Prometheus
 * 后自动生效。仪表**惰性创建**——首次使用时才向全局 MeterProvider 取,确保
 * startMetrics 已先注册好 Provider(否则会永久绑定到 no-op meter)。
 */

let cachedMeter: Meter | undefined;
function meter(): Meter {
  if (!cachedMeter) {
    cachedMeter = otelMetrics.getMeter("doc-pilot", "0.1.0");
  }
  return cachedMeter;
}

function once<T>(factory: (m: Meter) => T): () => T {
  let value: T | undefined;
  return () => {
    if (value === undefined) {
      value = factory(meter());
    }
    return value;
  };
}

// --- API ---
const httpDuration = once((m) =>
  m.createHistogram("http_request_duration", { unit: "ms", description: "HTTP 请求耗时" }),
);
const httpErrors = once((m) =>
  m.createCounter("http_request_errors", { description: "HTTP 错误响应数(status >= 500)" }),
);
const sseConnections = once<UpDownCounter>((m) =>
  m.createUpDownCounter("active_sse_connections", { description: "活跃 SSE 连接数" }),
);

// --- AI ---
const aiDuration = once((m) =>
  m.createHistogram("ai_generation_duration", { unit: "ms", description: "AI 调用耗时" }),
);
const aiInputTokens = once<Counter>((m) => m.createCounter("ai_input_tokens"));
const aiOutputTokens = once<Counter>((m) => m.createCounter("ai_output_tokens"));
const aiCostMicros = once<Counter>((m) => m.createCounter("ai_cost_micros"));
const aiInvalid = once<Counter>((m) =>
  m.createCounter("ai_invalid_response_count", { description: "结构化输出校验失败次数" }),
);

// --- RAG ---
const retrievalResultCount = once((m) =>
  m.createHistogram("retrieval_result_count", { description: "单次检索命中的来源数" }),
);
const retrievalTopScore = once((m) =>
  m.createHistogram("retrieval_top_score", { description: "检索最高相似度分" }),
);
const citationCount = once<Counter>((m) => m.createCounter("citation_count"));
const invalidCitationCount = once<Counter>((m) => m.createCounter("invalid_citation_count"));
const ragAnswers = once<Counter>((m) =>
  m.createCounter("rag_answers_total", {
    description: "问答完成数;按 insufficient_evidence 拆分可算拒答率",
  }),
);

// --- Queue ---
const jobDuration = once((m) =>
  m.createHistogram("job_duration", { unit: "ms", description: "任务处理耗时" }),
);
const jobRetry = once<Counter>((m) => m.createCounter("job_retry_count"));
const jobFailure = once<Counter>((m) => m.createCounter("job_failure_count"));

export const httpMetrics = {
  record(attrs: { method: string; route: string; status: number }, durationMs: number): void {
    const labels = { method: attrs.method, route: attrs.route, status: attrs.status };
    httpDuration().record(durationMs, labels);
    if (attrs.status >= 500) {
      httpErrors().add(1, labels);
    }
  },
};

/** AI 调用指标。入参兼容 AI Gateway 的 AITrace 结构(结构化子集)。 */
export interface AiTraceLike {
  capability: string;
  provider: string;
  model: string;
  ok: boolean;
  latencyMs: number;
  errorCode?: string;
  usage?: { inputTokens: number; outputTokens: number; costMicros: number };
}

export const aiMetrics = {
  recordTrace(trace: AiTraceLike): void {
    const labels = { capability: trace.capability, provider: trace.provider, model: trace.model };
    aiDuration().record(trace.latencyMs, labels);
    if (trace.ok && trace.usage) {
      aiInputTokens().add(trace.usage.inputTokens, labels);
      aiOutputTokens().add(trace.usage.outputTokens, labels);
      aiCostMicros().add(trace.usage.costMicros, labels);
    }
    if (trace.errorCode === "AI_INVALID_RESPONSE") {
      aiInvalid().add(1, labels);
    }
  },
};

export const ragMetrics = {
  retrieval(resultCount: number, topScore: number | null): void {
    retrievalResultCount().record(resultCount);
    if (topScore !== null) {
      retrievalTopScore().record(topScore);
    }
  },
  answer(input: {
    citationCount: number;
    invalidCitationCount: number;
    insufficientEvidence: boolean;
  }): void {
    if (input.citationCount > 0) {
      citationCount().add(input.citationCount);
    }
    if (input.invalidCitationCount > 0) {
      invalidCitationCount().add(input.invalidCitationCount);
    }
    ragAnswers().add(1, {
      insufficient_evidence: String(input.insufficientEvidence),
    });
  },
};

export const sseGauge = {
  inc(): void {
    sseConnections().add(1);
  },
  dec(): void {
    sseConnections().add(-1);
  },
};

export const jobMetrics = {
  completed(durationMs: number, attrs?: { stage?: string }): void {
    jobDuration().record(durationMs, {
      stage: attrs?.stage ?? "process_document",
      status: "completed",
    });
  },
  failed(attrs?: { stage?: string }): void {
    jobFailure().add(1, { stage: attrs?.stage ?? "process_document" });
  },
  retried(attrs?: { stage?: string }): void {
    jobRetry().add(1, { stage: attrs?.stage ?? "process_document" });
  },
};

/**
 * 队列深度(§29.2 queue_depth)。用 ObservableGauge + 采集回调:Prometheus 抓取时
 * 才调用 read() 读取当前 waiting+active 数。read 抛错时静默(避免影响抓取)。
 */
export function registerQueueDepthGauge(queueName: string, read: () => Promise<number>): void {
  const gauge = meter().createObservableGauge("queue_depth", {
    description: "队列待处理 + 处理中的任务数",
  });
  gauge.addCallback(async (result) => {
    try {
      result.observe(await read(), { queue: queueName });
    } catch {
      // 采集失败不影响其它指标。
    }
  });
}
