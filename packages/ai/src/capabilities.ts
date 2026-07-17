/**
 * Capability → 模型路由（rag.md#20.2 处理链第 2 步）。
 * 路由表由部署侧配置注入，Gateway 不硬编码任何 Provider / 模型名。
 */
export interface ModelPricing {
  inputMicrosPerToken: number;
  outputMicrosPerToken: number;
  /** embed 类能力使用；缺省回落到 inputMicrosPerToken。 */
  embeddingMicrosPerToken?: number;
}

export interface ModelRoute {
  provider: string;
  model: string;
  /** 缺省视为零成本（mock / 本地模型）。 */
  pricing?: ModelPricing;
}

export type CapabilityRoutes = Record<string, ModelRoute>;

export function resolveRoute(routes: CapabilityRoutes, capability: string): ModelRoute {
  const route = routes[capability];
  if (!route) {
    // 未注册的 capability 是接线错误而非运行时 AI 故障，直接抛普通 Error 让它在开发期炸出来。
    throw new Error(`未注册的 AI capability：${capability}`);
  }
  return route;
}
