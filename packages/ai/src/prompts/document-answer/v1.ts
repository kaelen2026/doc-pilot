import type { CitationSource } from "../../citations";
import type { PromptDefinition } from "../../prompt-registry";

/**
 * 正文与引用 JSON 的分隔标记。协议全貌见下方 system prompt 与
 * answer-stream.ts 的流式解析器。
 */
export const ANSWER_CITATIONS_MARKER = "===CITATIONS===";

/**
 * 文档问答 Prompt v1(rag.md §19/§22)。
 *
 * 输出协议:问答既要流式(SSE 逐段吐正文)又要结构化引用(AnswerSchema),
 * 因此让模型分两段输出:先是面向用户的答案正文(可直接流式展示),
 * 然后另起一行输出 ===CITATIONS=== 标记 + 引用 JSON 尾部。
 * 解析由 parseAnswerStream 完成,拼回 AnswerSchema 形状后走 validateAnswer 业务校验。
 *
 * gateway.streamText 对 prompt 只调 build({}),system 必须是静态的;
 * 检索来源与问题由调用方经 buildAnswerUserMessage 拼进 user message。
 */
export const documentAnswerPromptV1: PromptDefinition<Record<string, never>> = {
  id: "document-answer",
  version: "1.0.0",
  build() {
    return {
      system: [
        "你是严谨的文档问答引擎。用户会提供编号的文档来源片段和一个问题,你只能依据这些来源作答。",
        "",
        "回答规则:",
        "- 只使用来源中的信息,不引入外部知识,不猜测。",
        "- 答案中的每个关键结论都必须能在来源中找到依据。",
        "- 如果来源不足以回答问题,正文明确说明无法基于该文档回答,不要编造。",
        "- 使用用户问题的语言作答。",
        "",
        "输出格式(严格遵守,分两段):",
        `1. 先输出答案正文:面向用户,不要提及 sourceId、不要输出 JSON。正文中每一个有来源支撑的结论,都在该结论紧后面插入内嵌引用标记 [n](方括号包裹的阿拉伯数字),n 是下方 citations 数组中对应引用的序号(从 1 开始:第 1 条引用是 [1]、第 2 条是 [2],以此类推)。同一处结论涉及多条来源时可连写,如 [1][2]。`,
        "   - 正文可用轻量 Markdown 提升可读性:**加粗**、*斜体*、无序列表(- )、有序列表(1. )、内联代码(`code`)。不要使用标题(#)、表格、代码块围栏(```)、图片或链接语法,以免干扰引用标记 [n] 与前端展示。",
        `2. 正文结束后另起一行,输出 ${ANSWER_CITATIONS_MARKER},然后输出一个 JSON 对象(不要 markdown 围栏):`,
        `{"insufficientEvidence": false, "citations": [{"sourceId": "S1", "quote": "来源原文的逐字片段", "claim": "该引用支撑的结论"}]}`,
        "- citations 数组的顺序即为正文标记的编号顺序:正文里每个 [n] 都要对应数组中的第 n 条引用,数组中每条引用也都要在正文中至少被一个 [n] 引用,二者一一对应。",
        "- quote 必须逐字摘自对应来源的原文,不得改写。",
        "- 证据不足拒答时 insufficientEvidence 为 true 且 citations 为空数组 [],正文中不要出现任何 [n] 标记。",
        "- 证据充分时至少给出一条引用。",
      ].join("\n"),
      messages: [],
    };
  },
};

/**
 * 把检索来源 + 问题拼成 user message(调用方经 gateway.streamText 的 messages 传入)。
 * sourceId 与 CitationSource 一致,是引用校验的比对键。
 */
export function buildAnswerUserMessage(input: {
  sources: CitationSource[];
  question: string;
}): string {
  const sources = input.sources
    .map((s) => {
      const pages =
        s.pageStart != null
          ? `(第 ${s.pageStart}${s.pageEnd != null && s.pageEnd !== s.pageStart ? `-${s.pageEnd}` : ""} 页)`
          : "";
      return `[来源 ${s.sourceId}]${pages}\n${s.text}`;
    })
    .join("\n\n");
  return `文档来源片段:\n\n${sources}\n\n问题:${input.question}`;
}
