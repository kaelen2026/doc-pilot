import { describe, expect, it } from "vitest";
import { isAIError } from "../errors";
import { createOpenAIEmbeddingAdapter } from "./openai-embedding";

function fetchStub(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

describe("createOpenAIEmbeddingAdapter", () => {
  it("按 index 归位向量并映射 usage", async () => {
    let captured: { url: string; body: Record<string, unknown> } | undefined;
    const adapter = createOpenAIEmbeddingAdapter({
      apiKey: "sk-test",
      baseURL: "https://gateway.example/v1/",
      fetchFn: (async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        captured = { url: String(url), body: JSON.parse(String(init?.body)) };
        return new Response(
          JSON.stringify({
            // 故意乱序,验证按 index 归位。
            data: [
              { index: 1, embedding: [0.3, 0.4] },
              { index: 0, embedding: [0.1, 0.2] },
            ],
            usage: { prompt_tokens: 7 },
          }),
          { status: 200 },
        );
      }) as typeof fetch,
    });

    const result = await adapter.embed({ model: "text-embedding-3-small", texts: ["a", "b"] });
    expect(captured?.url).toBe("https://gateway.example/v1/embeddings");
    expect(captured?.body).toEqual({ model: "text-embedding-3-small", input: ["a", "b"] });
    expect(result.embeddings).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(result.usage.embeddingTokens).toBe(7);
  });

  it("429 → AI_RATE_LIMITED", async () => {
    const adapter = createOpenAIEmbeddingAdapter({
      apiKey: "sk-test",
      fetchFn: fetchStub(429, { error: { message: "rate limited" } }),
    });
    await expect(adapter.embed({ model: "m", texts: ["a"] })).rejects.toSatisfy(
      (err: unknown) => isAIError(err) && err.code === "AI_RATE_LIMITED",
    );
  });

  it("返回数量与请求不符 → AI_INVALID_RESPONSE", async () => {
    const adapter = createOpenAIEmbeddingAdapter({
      apiKey: "sk-test",
      fetchFn: fetchStub(200, { data: [{ index: 0, embedding: [1] }] }),
    });
    await expect(adapter.embed({ model: "m", texts: ["a", "b"] })).rejects.toSatisfy(
      (err: unknown) => isAIError(err) && err.code === "AI_INVALID_RESPONSE",
    );
  });

  it("文本生成能力抛接线错误", async () => {
    const adapter = createOpenAIEmbeddingAdapter({ apiKey: "sk-test" });
    await expect(adapter.generateText({ model: "m", system: "", messages: [] })).rejects.toThrow(
      /仅支持 embed/,
    );
  });
});
