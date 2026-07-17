# ADR-007：结构化模型输出

**状态**：Accepted

## 背景

问答与摘要需要机器可处理的输出（引用、关键点、是否证据不足），而非自由文本。自由文本无法可靠地做引用校验与拒答判断。

## 决策

AI 输出使用结构化 Schema（Zod）约束。例如问答：

```ts
const AnswerSchema = z.object({
  answer: z.string(),
  citations: z.array(z.object({
    sourceId: z.string(),
    quote: z.string(),
    claim: z.string()
  })),
  insufficientEvidence: z.boolean()
});
```

模型输出通过 Zod 校验后，**还要执行业务校验**：`sourceId` 是否存在、是否属于本次 Context、是否属于当前文档、`quote` 是否与原文大致匹配。

## 后果

- 引用可校验，无证据可明确拒答（保证"引用 ID 有效率 100%"）。
- 需处理模型返回不符合 Schema 的情况（映射为 `AI_INVALID_RESPONSE`）。
- Schema 与 Prompt 需版本化管理。

## 参见

- [RAG · Prompt 管理](../architecture/rag.md#19-prompt-管理)
- [RAG · 问答流式接口](../architecture/rag.md#22-问答流式接口)
