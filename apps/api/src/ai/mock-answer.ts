import { type AIMessage, ANSWER_CITATIONS_MARKER } from "@doc-pilot/ai";

/**
 * Mock 问答输出(仅在缺 ANTHROPIC_API_KEY、问答回落 mock 时使用)。
 *
 * 没有真实模型也要能驱动「回答 + 有效引用」的完整链路(E2E happy path、本地手测):
 * 从注入 Prompt 的来源片段里取第一条来源,逐字截取一小段作 quote,拼成符合两段式
 * 协议的答案。这样一定能过 validateAnswer——sourceId 在本次上下文、属当前文档、
 * quote 是来源原文的子串(匹配度 1.0)。
 *
 * 解析不出来源时回落显式拒答(理论上不会发生:检索为空时上游直接拒答、根本不调用
 * 生成模型,见 conversation.service.generateAnswer)。
 */

const REFUSAL_CHUNKS: string[] = [
  "未配置 ANTHROPIC_API_KEY,",
  "无法基于文档生成回答,这是本地占位拒答。",
  `\n${ANSWER_CITATIONS_MARKER}\n`,
  '{"insufficientEvidence": true, "citations": []}',
];

/** quote 逐字截取的最大字符数;够过匹配阈值即可,不必是整段。 */
const QUOTE_MAX_CHARS = 48;

export function mockAnswerChunks(input: { messages: AIMessage[] }): string[] {
  const userText = lastUserContent(input.messages);
  const source = userText ? firstSource(userText) : null;
  if (!source) {
    return REFUSAL_CHUNKS;
  }
  const quote = source.text.slice(0, QUOTE_MAX_CHARS).trim();
  if (quote.length < 2) {
    return REFUSAL_CHUNKS;
  }
  const tail = {
    insufficientEvidence: false,
    citations: [
      {
        sourceId: source.sourceId,
        quote,
        claim: "占位回答:该结论由此来源片段支撑。",
      },
    ],
  };
  return [
    "根据文档来源,",
    "这是 Mock Provider 基于检索片段生成的占位回答(未配置真实模型)。",
    `\n${ANSWER_CITATIONS_MARKER}\n`,
    JSON.stringify(tail),
  ];
}

function lastUserContent(messages: AIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role === "user") {
      return message.content;
    }
  }
  return null;
}

/**
 * 从 buildAnswerUserMessage 拼出的用户消息里解析第一条来源。消息形如:
 *   文档来源片段:
 *
 *   [来源 S1](第 3 页)
 *   {正文…}
 *
 *   [来源 S2]…
 *
 *   问题:{question}
 */
function firstSource(userText: string): { sourceId: string; text: string } | null {
  const sourcesPart = userText.split("\n\n问题:")[0] ?? userText;
  for (const block of sourcesPart.split("\n\n")) {
    const match = block.match(/^\[来源 (S\d+)\][^\n]*\n([\s\S]+)$/);
    const sourceId = match?.[1];
    const text = match?.[2]?.trim();
    if (sourceId && text) {
      return { sourceId, text };
    }
  }
  return null;
}
