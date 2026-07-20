import type { ProviderAdapter } from "./adapter";
import { type CapabilityRoutes, type ModelRoute, resolveRoute } from "./capabilities";
import { AIError, normalizeAIError } from "./errors";
import type { PromptRegistry } from "./prompt-registry";
import { stripCodeFence } from "./strip-code-fence";
import type { AIGateway, AIMetadata, AIUsage } from "./types";

export interface AITrace {
  capability: string;
  promptId?: string;
  promptVersion?: string;
  provider: string;
  model: string;
  latencyMs: number;
  ok: boolean;
  errorCode?: string;
  /** 成功调用携带完整用量，供 recordTrace 一次写出完整的 ai_generations 行；失败时为空。 */
  usage?: AIUsage;
  metadata: AIMetadata;
}

export interface AIGatewayHooks {
  /** 配额检查（处理链第 3 步）。拒绝时抛 AIError("AI_QUOTA_EXCEEDED")。 */
  checkQuota?(input: { capability: string; metadata: AIMetadata }): Promise<void> | void;
  /** Usage 落库（cross-cutting.md#28）。集成 PR 接 DB，这里只定义挂点。 */
  recordUsage?(usage: AIUsage, metadata: AIMetadata): Promise<void> | void;
  recordTrace?(trace: AITrace): Promise<void> | void;
}

export interface AIGatewayOptions {
  routes: CapabilityRoutes;
  /** provider 名 → Adapter。 */
  adapters: Record<string, ProviderAdapter>;
  prompts: PromptRegistry;
  hooks?: AIGatewayHooks;
}

/**
 * 组装 AI Gateway（ADR-006）。
 * 处理链：校验 Capability → 解析 Model Route → 检查 Quota → 解析 Prompt Version
 * → 调用 Provider Adapter → 记录 Usage → 记录 Trace → 标准化错误 → 返回。
 */
export function createAIGateway(options: AIGatewayOptions): AIGateway {
  const { routes, adapters, prompts, hooks = {} } = options;

  function adapterFor(route: ModelRoute): ProviderAdapter {
    const adapter = adapters[route.provider];
    if (!adapter) {
      throw new Error(`Provider 未注册 Adapter：${route.provider}`);
    }
    return adapter;
  }

  function buildUsage(
    route: ModelRoute,
    capability: string,
    raw: {
      inputTokens: number;
      outputTokens: number;
      cacheTokens?: number;
      embeddingTokens?: number;
    },
    latencyMs: number,
  ): AIUsage {
    const pricing = route.pricing;
    const embeddingRate = pricing?.embeddingMicrosPerToken ?? pricing?.inputMicrosPerToken ?? 0;
    const costMicros = pricing
      ? Math.round(
          raw.inputTokens * pricing.inputMicrosPerToken +
            raw.outputTokens * pricing.outputMicrosPerToken +
            (raw.embeddingTokens ?? 0) * embeddingRate,
        )
      : 0;
    return {
      provider: route.provider,
      model: route.model,
      capability,
      inputTokens: raw.inputTokens,
      outputTokens: raw.outputTokens,
      cacheTokens: raw.cacheTokens ?? 0,
      embeddingTokens: raw.embeddingTokens ?? 0,
      latencyMs,
      costMicros,
    };
  }

  /** Usage / Trace 记录失败不反噬业务调用：吞掉并打日志，计费缺口靠对账兜底。 */
  async function record(fn: (() => Promise<void> | void) | undefined): Promise<void> {
    if (!fn) {
      return;
    }
    try {
      await fn();
    } catch (err) {
      console.error("[ai-gateway] usage/trace 记录失败", err);
    }
  }

  async function traced<T>(
    ctx: { capability: string; promptId?: string; promptVersion?: string; metadata: AIMetadata },
    route: ModelRoute,
    run: () => Promise<{ value: T; usage: AIUsage }>,
  ): Promise<T> {
    const startedAt = performance.now();
    try {
      const { value, usage } = await run();
      await record(() => hooks.recordUsage?.(usage, ctx.metadata));
      await record(() =>
        hooks.recordTrace?.({
          ...ctx,
          provider: route.provider,
          model: route.model,
          latencyMs: usage.latencyMs,
          ok: true,
          usage,
        }),
      );
      return value;
    } catch (err) {
      const normalized = normalizeAIError(err);
      await record(() =>
        hooks.recordTrace?.({
          ...ctx,
          provider: route.provider,
          model: route.model,
          latencyMs: Math.round(performance.now() - startedAt),
          ok: false,
          errorCode: normalized.code,
        }),
      );
      throw normalized;
    }
  }

  return {
    async generateObject(input) {
      const route = resolveRoute(routes, input.capability);
      await hooks.checkQuota?.({ capability: input.capability, metadata: input.metadata });
      const prompt = prompts.resolve(input.promptId, input.promptVersion);
      const built = prompt.build(input.variables);
      const ctx = {
        capability: input.capability,
        promptId: input.promptId,
        promptVersion: input.promptVersion,
        metadata: input.metadata,
      };

      return traced(ctx, route, async () => {
        const startedAt = performance.now();
        const { text, usage: rawUsage } = await adapterFor(route).generateText({
          model: route.model,
          system: built.system,
          messages: built.messages,
          maxTokens: route.maxTokens,
        });
        const latencyMs = Math.round(performance.now() - startedAt);

        // 结构化输出（ADR-007）：先 JSON 解析再 Zod 校验，失败一律 AI_INVALID_RESPONSE。
        // 真实模型常把 JSON 包在 markdown 代码块里，解析前先剥掉围栏。
        let json: unknown;
        try {
          json = JSON.parse(stripCodeFence(text));
        } catch (err) {
          throw new AIError("AI_INVALID_RESPONSE", "模型输出不是合法 JSON", { cause: err });
        }
        const parsed = input.schema.safeParse(json);
        if (!parsed.success) {
          throw new AIError("AI_INVALID_RESPONSE", "模型输出不符合 Schema", {
            cause: parsed.error,
          });
        }

        const usage = buildUsage(route, input.capability, rawUsage, latencyMs);
        return { value: { data: parsed.data, usage }, usage };
      });
    },

    async streamText(input) {
      const route = resolveRoute(routes, input.capability);
      await hooks.checkQuota?.({ capability: input.capability, metadata: input.metadata });
      const prompt = prompts.resolve(input.promptId, input.promptVersion);
      const built = prompt.build({});
      const ctx = {
        capability: input.capability,
        promptId: input.promptId,
        promptVersion: input.promptVersion,
        metadata: input.metadata,
      };

      const startedAt = performance.now();
      try {
        const { textStream, usage: rawUsagePromise } = await adapterFor(route).streamText({
          model: route.model,
          system: built.system,
          messages: [...built.messages, ...input.messages],
          maxTokens: route.maxTokens,
        });
        // 流式路径的 Usage 在流结束后才可知，Usage/Trace 记录挂在 usage promise 上。
        const usage = rawUsagePromise.then(async (raw) => {
          const built2 = buildUsage(
            route,
            input.capability,
            raw,
            Math.round(performance.now() - startedAt),
          );
          await record(() => hooks.recordUsage?.(built2, input.metadata));
          await record(() =>
            hooks.recordTrace?.({
              ...ctx,
              provider: route.provider,
              model: route.model,
              latencyMs: built2.latencyMs,
              ok: true,
              usage: built2,
            }),
          );
          return built2;
        });
        return { textStream, usage };
      } catch (err) {
        const normalized = normalizeAIError(err);
        await record(() =>
          hooks.recordTrace?.({
            ...ctx,
            provider: route.provider,
            model: route.model,
            latencyMs: Math.round(performance.now() - startedAt),
            ok: false,
            errorCode: normalized.code,
          }),
        );
        throw normalized;
      }
    },

    async embed(input) {
      const route = resolveRoute(routes, input.capability);
      await hooks.checkQuota?.({ capability: input.capability, metadata: input.metadata });
      const ctx = { capability: input.capability, metadata: input.metadata };

      return traced(ctx, route, async () => {
        const startedAt = performance.now();
        const { embeddings, usage: rawUsage } = await adapterFor(route).embed({
          model: route.model,
          texts: input.texts,
        });
        const latencyMs = Math.round(performance.now() - startedAt);
        const usage = buildUsage(route, input.capability, rawUsage, latencyMs);
        return { value: { embeddings, usage }, usage };
      });
    },
  };
}
