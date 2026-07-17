import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { createAnthropicAdapter } from "./anthropic";

type FakeMessage = {
  content: Array<{ type: string; text?: string; thinking?: string }>;
  stop_reason: string;
  usage: Record<string, number | null>;
};

function fakeMessage(overrides: Partial<FakeMessage> = {}): FakeMessage {
  return {
    content: [{ type: "text", text: '{"summary":"ok"}' }],
    stop_reason: "end_turn",
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 30,
      cache_creation_input_tokens: 5,
    },
    ...overrides,
  };
}

/** 构造满足 adapter 用法的最小 fake client：messages.stream 返回可迭代 + finalMessage。 */
function fakeClient(config: {
  events?: Array<Record<string, unknown>>;
  message?: FakeMessage;
  throwOnStream?: Error;
  capture?: (params: unknown) => void;
}) {
  return {
    messages: {
      stream(params: unknown) {
        config.capture?.(params);
        if (config.throwOnStream) {
          throw config.throwOnStream;
        }
        return {
          async *[Symbol.asyncIterator]() {
            for (const event of config.events ?? []) {
              yield event;
            }
          },
          finalMessage: async () => config.message ?? fakeMessage(),
        };
      },
    },
  } as unknown as Anthropic;
}

const input = {
  model: "claude-opus-4-8",
  system: "总结以下内容",
  messages: [{ role: "user" as const, content: "正文" }],
};

describe("anthropic adapter · generateText", () => {
  it("拼接 text 块、映射 usage（cache = read + creation）", async () => {
    const message = fakeMessage({
      content: [
        { type: "thinking", thinking: "..." },
        { type: "text", text: '{"a":' },
        { type: "text", text: "1}" },
      ],
    });
    const adapter = createAnthropicAdapter({ client: fakeClient({ message }) });

    const result = await adapter.generateText(input);

    expect(result.text).toBe('{"a":1}');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 20, cacheTokens: 35 });
  });

  it("默认参数：流式 max_tokens 余量、adaptive thinking、system 级消息不进 messages", async () => {
    let captured: Record<string, unknown> = {};
    const adapter = createAnthropicAdapter({
      client: fakeClient({ capture: (p) => (captured = p as Record<string, unknown>) }),
    });

    await adapter.generateText({
      ...input,
      messages: [
        { role: "system", content: "运行时提示" },
        { role: "user", content: "正文" },
      ],
    });

    expect(captured.model).toBe("claude-opus-4-8");
    expect(captured.max_tokens).toBe(64000);
    expect(captured.thinking).toEqual({ type: "adaptive" });
    expect(captured.messages).toEqual([{ role: "user", content: "正文" }]);
  });

  it("路由 maxTokens 覆盖默认值；thinking: none 时省略参数", async () => {
    let captured: Record<string, unknown> = {};
    const adapter = createAnthropicAdapter({
      thinking: "none",
      client: fakeClient({ capture: (p) => (captured = p as Record<string, unknown>) }),
    });

    await adapter.generateText({ ...input, maxTokens: 8000 });

    expect(captured.max_tokens).toBe(8000);
    expect("thinking" in captured).toBe(false);
  });

  it("stop_reason 映射：refusal → AI_CONTENT_BLOCKED，max_tokens 截断 → AI_INVALID_RESPONSE", async () => {
    const refused = createAnthropicAdapter({
      client: fakeClient({ message: fakeMessage({ stop_reason: "refusal" }) }),
    });
    await expect(refused.generateText(input)).rejects.toMatchObject({
      name: "AIError",
      code: "AI_CONTENT_BLOCKED",
    });

    const truncated = createAnthropicAdapter({
      client: fakeClient({ message: fakeMessage({ stop_reason: "max_tokens" }) }),
    });
    await expect(truncated.generateText(input)).rejects.toMatchObject({
      code: "AI_INVALID_RESPONSE",
    });
  });

  it("SDK typed error 映射到 AI_* 码", async () => {
    const cases: Array<[Error, string]> = [
      [
        Anthropic.APIError.generate(
          429,
          { error: { type: "rate_limit_error", message: "rate limited" } },
          "rate limited",
          new Headers(),
        ),
        "AI_RATE_LIMITED",
      ],
      [new Anthropic.APIConnectionTimeoutError({ message: "timed out" }), "AI_TIMEOUT"],
      [
        Anthropic.APIError.generate(
          529,
          { error: { type: "overloaded_error", message: "overloaded" } },
          "overloaded",
          new Headers(),
        ),
        "AI_PROVIDER_UNAVAILABLE",
      ],
      [
        Anthropic.APIError.generate(
          400,
          {
            error: { type: "invalid_request_error", message: "prompt is too long: 210000 tokens" },
          },
          "prompt is too long: 210000 tokens",
          new Headers(),
        ),
        "AI_CONTEXT_TOO_LARGE",
      ],
      [new Error("socket hang up"), "AI_PROVIDER_UNAVAILABLE"],
    ];

    for (const [thrown, code] of cases) {
      const adapter = createAnthropicAdapter({ client: fakeClient({ throwOnStream: thrown }) });
      await expect(adapter.generateText(input)).rejects.toMatchObject({ name: "AIError", code });
    }
  });
});

describe("anthropic adapter · streamText", () => {
  it("透传 text_delta，流结束后 usage resolve", async () => {
    const adapter = createAnthropicAdapter({
      client: fakeClient({
        events: [
          { type: "content_block_start", content_block: { type: "text" } },
          { type: "content_block_delta", delta: { type: "text_delta", text: "答" } },
          { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "x" } },
          { type: "content_block_delta", delta: { type: "text_delta", text: "案" } },
        ],
      }),
    });

    const { textStream, usage } = await adapter.streamText(input);
    let text = "";
    for await (const chunk of textStream) {
      text += chunk;
    }

    expect(text).toBe("答案");
    await expect(usage).resolves.toMatchObject({ inputTokens: 100, outputTokens: 20 });
  });
});

describe("anthropic adapter · embed", () => {
  it("是接线错误：抛普通 Error 而非 AIError", async () => {
    const adapter = createAnthropicAdapter({ client: fakeClient({}) });
    const attempt = adapter.embed({ model: "x", texts: ["a"] });
    await expect(attempt).rejects.toThrow(/不提供 embedding/);
    await expect(attempt).rejects.not.toMatchObject({ name: "AIError" });
  });
});
