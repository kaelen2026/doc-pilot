import { describe, expect, it } from "vitest";
import { resolveProviderConfig } from "./env";

describe("resolveProviderConfig", () => {
  it("凭据全缺时两能力都回落 mock", () => {
    const cfg = resolveProviderConfig({});
    expect(cfg.hasAnthropic).toBe(false);
    expect(cfg.hasOpenAI).toBe(false);
    expect(cfg.anthropic).toBeUndefined();
    expect(cfg.openai).toBeUndefined();
  });

  it("统一网关:一个令牌 + host 同时点亮文本与 embedding", () => {
    const cfg = resolveProviderConfig({
      AI_GATEWAY_BASE_URL: "https://new-api.lingowhale.com",
      AI_GATEWAY_API_KEY: "sk-gw",
    });
    expect(cfg.hasAnthropic).toBe(true);
    expect(cfg.hasOpenAI).toBe(true);
    // 文本走 Anthropic SDK,baseURL 用 host 原样(SDK 自行拼 /v1/messages)。
    expect(cfg.anthropic).toEqual({ apiKey: "sk-gw", baseURL: "https://new-api.lingowhale.com" });
    // embedding 走 OpenAI 兼容端点,host 需补 /v1(adapter 自行拼 /embeddings)。
    expect(cfg.openai).toEqual({ apiKey: "sk-gw", baseURL: "https://new-api.lingowhale.com/v1" });
  });

  it("BASE_URL 末尾斜杠被规整,不会拼出 //v1", () => {
    const cfg = resolveProviderConfig({
      AI_GATEWAY_BASE_URL: "https://new-api.lingowhale.com/",
      AI_GATEWAY_API_KEY: "sk-gw",
    });
    expect(cfg.anthropic?.baseURL).toBe("https://new-api.lingowhale.com");
    expect(cfg.openai?.baseURL).toBe("https://new-api.lingowhale.com/v1");
  });

  it("混搭:文本走网关 + embedding 走官方(官方 Key 不借网关 host)", () => {
    const cfg = resolveProviderConfig({
      AI_GATEWAY_BASE_URL: "https://new-api.lingowhale.com",
      AI_GATEWAY_API_KEY: "sk-gw",
      OPENAI_API_KEY: "sk-openai",
    });
    // 文本无显式 Key,回落网关。
    expect(cfg.anthropic).toEqual({ apiKey: "sk-gw", baseURL: "https://new-api.lingowhale.com" });
    // embedding 有显式官方 Key,baseURL 留空走官方默认端点——绝不能把官方 Key 发去网关。
    expect(cfg.openai).toEqual({ apiKey: "sk-openai", baseURL: undefined });
  });

  it("显式 *_BASE_URL 覆盖网关端点", () => {
    const cfg = resolveProviderConfig({
      AI_GATEWAY_BASE_URL: "https://new-api.lingowhale.com",
      AI_GATEWAY_API_KEY: "sk-gw",
      ANTHROPIC_BASE_URL: "https://api.anthropic.com",
      OPENAI_BASE_URL: "https://api.openai.com/v1",
    });
    expect(cfg.anthropic?.baseURL).toBe("https://api.anthropic.com");
    expect(cfg.openai?.baseURL).toBe("https://api.openai.com/v1");
  });

  it("自托管 embedding 端点(如 Ollama):仅 OPENAI_BASE_URL、无 key 也点亮 embedding", () => {
    const cfg = resolveProviderConfig({
      OPENAI_BASE_URL: "http://localhost:11434/v1",
    });
    expect(cfg.hasOpenAI).toBe(true);
    expect(cfg.openai).toEqual({ apiKey: undefined, baseURL: "http://localhost:11434/v1" });
    // 文本无凭据仍回落 mock。
    expect(cfg.hasAnthropic).toBe(false);
  });

  it("仅官方 Key、无网关:baseURL 为 undefined(走各自 SDK 默认端点)", () => {
    const cfg = resolveProviderConfig({
      ANTHROPIC_API_KEY: "sk-ant",
      OPENAI_API_KEY: "sk-openai",
    });
    expect(cfg.anthropic).toEqual({ apiKey: "sk-ant", baseURL: undefined });
    expect(cfg.openai).toEqual({ apiKey: "sk-openai", baseURL: undefined });
  });

  it("AI_ANTHROPIC_THINKING=none 关闭 thinking(中转网关不支持时的安全阀)", () => {
    const cfg = resolveProviderConfig({
      AI_GATEWAY_BASE_URL: "https://new-api.lingowhale.com",
      AI_GATEWAY_API_KEY: "sk-gw",
      AI_ANTHROPIC_THINKING: "none",
    });
    expect(cfg.anthropic).toEqual({
      apiKey: "sk-gw",
      baseURL: "https://new-api.lingowhale.com",
      thinking: "none",
    });
  });

  it("默认不注入 thinking(沿用 adapter 的 adaptive 缺省)", () => {
    const cfg = resolveProviderConfig({ AI_GATEWAY_API_KEY: "sk-gw" });
    expect(cfg.anthropic).not.toHaveProperty("thinking");
  });
});
