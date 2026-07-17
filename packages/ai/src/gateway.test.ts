import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMockAdapter } from "./adapters/mock";
import { AIError, isAIError } from "./errors";
import { type AIGatewayHooks, createAIGateway } from "./gateway";
import { createPromptRegistry, type PromptDefinition } from "./prompt-registry";
import type { AIMetadata } from "./types";

const SummarySchema = z.object({ summary: z.string() });

const summaryPrompt: PromptDefinition = {
  id: "document-summary",
  version: "1.0.0",
  build: (variables) => ({
    system: "总结以下内容",
    messages: [{ role: "user", content: String(variables.text ?? "") }],
  }),
};

const metadata: AIMetadata = { workspaceId: "ws_1", documentId: "doc_1" };

function buildGateway(overrides?: {
  adapter?: ReturnType<typeof createMockAdapter>;
  hooks?: AIGatewayHooks;
  pricing?: { inputMicrosPerToken: number; outputMicrosPerToken: number };
}) {
  return createAIGateway({
    routes: {
      summarize: { provider: "mock", model: "mock-large", pricing: overrides?.pricing },
      "embed-chunk": {
        provider: "mock",
        model: "mock-embed",
        pricing: { inputMicrosPerToken: 0, outputMicrosPerToken: 0, embeddingMicrosPerToken: 2 },
      },
      answer: { provider: "mock", model: "mock-large" },
    },
    adapters: {
      mock: overrides?.adapter ?? createMockAdapter({ objectResponse: { summary: "一段摘要" } }),
    },
    prompts: createPromptRegistry([summaryPrompt]),
    hooks: overrides?.hooks,
  });
}

function generateSummary(gateway: ReturnType<typeof buildGateway>) {
  return gateway.generateObject({
    capability: "summarize",
    promptId: "document-summary",
    promptVersion: "1.0.0",
    schema: SummarySchema,
    variables: { text: "正文" },
    metadata,
  });
}

describe("generateObject", () => {
  it("校验 Schema 并按定价计算 costMicros", async () => {
    const recordUsage = vi.fn();
    const gateway = buildGateway({
      hooks: { recordUsage },
      pricing: { inputMicrosPerToken: 10, outputMicrosPerToken: 30 },
    });

    const result = await generateSummary(gateway);

    expect(result.data).toEqual({ summary: "一段摘要" });
    expect(result.usage.provider).toBe("mock");
    expect(result.usage.costMicros).toBe(
      result.usage.inputTokens * 10 + result.usage.outputTokens * 30,
    );
    expect(recordUsage).toHaveBeenCalledWith(result.usage, metadata);
  });

  it("容忍 markdown 代码围栏包裹的 JSON 输出", async () => {
    const adapter = createMockAdapter();
    vi.spyOn(adapter, "generateText").mockResolvedValue({
      text: '```json\n{"summary":"围栏摘要"}\n```',
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const gateway = buildGateway({ adapter });

    await expect(generateSummary(gateway)).resolves.toMatchObject({
      data: { summary: "围栏摘要" },
    });
  });

  it("输出不符合 Schema 时抛 AI_INVALID_RESPONSE", async () => {
    const gateway = buildGateway({
      adapter: createMockAdapter({ objectResponse: { wrong: true } }),
    });
    await expect(generateSummary(gateway)).rejects.toMatchObject({
      name: "AIError",
      code: "AI_INVALID_RESPONSE",
    });
  });

  it("Quota 拒绝时抛 AI_QUOTA_EXCEEDED 且不触达 Adapter", async () => {
    const adapter = createMockAdapter();
    const generateText = vi.spyOn(adapter, "generateText");
    const gateway = buildGateway({
      adapter,
      hooks: {
        checkQuota() {
          throw new AIError("AI_QUOTA_EXCEEDED");
        },
      },
    });

    await expect(generateSummary(gateway)).rejects.toMatchObject({ code: "AI_QUOTA_EXCEEDED" });
    expect(generateText).not.toHaveBeenCalled();
  });

  it("未注册 capability 是接线错误，抛普通 Error 而非 AIError", async () => {
    const gateway = buildGateway();
    const attempt = gateway.generateObject({
      capability: "rerank",
      promptId: "document-summary",
      promptVersion: "1.0.0",
      schema: SummarySchema,
      variables: {},
      metadata,
    });
    await expect(attempt).rejects.toSatisfy((err: unknown) => !isAIError(err));
  });

  it("Adapter 抛出的 AIError 原样透传，未知错误收敛为 AI_PROVIDER_UNAVAILABLE", async () => {
    const rateLimited = buildGateway({
      adapter: createMockAdapter({ failWith: new AIError("AI_RATE_LIMITED") }),
    });
    await expect(generateSummary(rateLimited)).rejects.toMatchObject({ code: "AI_RATE_LIMITED" });

    const unknown = buildGateway({
      adapter: createMockAdapter({ failWith: new Error("socket hang up") }),
    });
    await expect(generateSummary(unknown)).rejects.toMatchObject({
      code: "AI_PROVIDER_UNAVAILABLE",
    });
  });

  it("失败调用也记录 Trace，且 Usage/Trace 记录失败不反噬业务结果", async () => {
    const recordTrace = vi.fn();
    const failing = buildGateway({
      adapter: createMockAdapter({ failWith: new AIError("AI_TIMEOUT") }),
      hooks: { recordTrace },
    });
    await expect(generateSummary(failing)).rejects.toMatchObject({ code: "AI_TIMEOUT" });
    expect(recordTrace).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, errorCode: "AI_TIMEOUT" }),
    );

    const noisy = buildGateway({
      hooks: {
        recordUsage() {
          throw new Error("db down");
        },
      },
    });
    await expect(generateSummary(noisy)).resolves.toMatchObject({ data: { summary: "一段摘要" } });
  });
});

describe("embed", () => {
  it("同文本得到相同向量，embeddingTokens 计入成本", async () => {
    const gateway = buildGateway();
    const input = {
      capability: "embed-chunk",
      texts: ["第一段", "第一段", "另一段"],
      metadata,
    };
    const result = await gateway.embed(input);

    expect(result.embeddings).toHaveLength(3);
    expect(result.embeddings[0]).toEqual(result.embeddings[1]);
    expect(result.embeddings[0]).not.toEqual(result.embeddings[2]);
    expect(result.usage.embeddingTokens).toBeGreaterThan(0);
    expect(result.usage.costMicros).toBe(result.usage.embeddingTokens * 2);
  });
});

describe("streamText", () => {
  it("透传文本流，流结束后 resolve Usage 并触发记录", async () => {
    const recordUsage = vi.fn();
    const gateway = createAIGateway({
      routes: { answer: { provider: "mock", model: "mock-large" } },
      adapters: { mock: createMockAdapter({ streamChunks: ["答", "案"] }) },
      prompts: createPromptRegistry([
        {
          id: "document-answer",
          version: "1.0.0",
          build: () => ({ system: "回答问题", messages: [] }),
        },
      ]),
      hooks: { recordUsage },
    });

    const result = await gateway.streamText({
      capability: "answer",
      promptId: "document-answer",
      promptVersion: "1.0.0",
      messages: [{ role: "user", content: "问题" }],
      metadata,
    });

    let text = "";
    for await (const chunk of result.textStream) {
      text += chunk;
    }
    const usage = await result.usage;

    expect(text).toBe("答案");
    expect(usage.outputTokens).toBeGreaterThan(0);
    expect(recordUsage).toHaveBeenCalledWith(usage, metadata);
  });
});
