import type { AIMessage } from "./types";

/**
 * Prompt 定义（rag.md#19）：Prompt 不写死在 Service，以 id + version 注册与解析。
 * 具体 Prompt（document-summary 等）随各自的功能 PR 落在 prompts/ 下。
 */
export interface PromptDefinition<TVars = Record<string, unknown>> {
  id: string;
  /** 语义化版本字符串，如 "1.0.0"。同 id 可注册多个版本共存。 */
  version: string;
  build(variables: TVars): { system: string; messages: AIMessage[] };
}

export interface PromptRegistry {
  register(def: PromptDefinition): void;
  resolve(id: string, version: string): PromptDefinition;
}

export function createPromptRegistry(defs: PromptDefinition[] = []): PromptRegistry {
  const byKey = new Map<string, PromptDefinition>();
  const key = (id: string, version: string) => `${id}@${version}`;

  const registry: PromptRegistry = {
    register(def) {
      const k = key(def.id, def.version);
      if (byKey.has(k)) {
        throw new Error(`Prompt 重复注册：${k}`);
      }
      byKey.set(k, def);
    },
    resolve(id, version) {
      const def = byKey.get(key(id, version));
      if (!def) {
        throw new Error(`Prompt 未注册：${key(id, version)}`);
      }
      return def;
    },
  };

  for (const def of defs) {
    registry.register(def);
  }
  return registry;
}
