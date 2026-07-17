import { type Answer, AnswerSchema } from "./citations";
import { AIError } from "./errors";
import { ANSWER_CITATIONS_MARKER } from "./prompts/document-answer/v1";

export interface ParsedAnswerStream {
  /**
   * 答案正文增量(已剔除引用尾部),可直接作 SSE message.delta 逐段下发。
   * 注意:必须消费完 textDeltas,answer 才会 resolve。
   */
  textDeltas: AsyncIterable<string>;
  /** 流结束后 resolve 为完整 Answer(正文 + 引用),协议违规时 reject AI_INVALID_RESPONSE。 */
  answer: Promise<Answer>;
}

const TailSchema = AnswerSchema.pick({ citations: true, insufficientEvidence: true });

/**
 * 解析 document-answer 的两段式输出流(协议见 prompts/document-answer/v1.ts):
 * 标记之前是正文(逐段透传),之后是引用 JSON(缓冲到流结束再解析)。
 * 标记可能被任意切分到多个 delta 里,因此正文侧始终扣留「可能是标记前缀」的尾部,
 * 其余字符立即吐出,保证流式延迟不受影响。
 */
export function parseAnswerStream(source: AsyncIterable<string>): ParsedAnswerStream {
  let resolveAnswer!: (answer: Answer) => void;
  let rejectAnswer!: (err: unknown) => void;
  const answer = new Promise<Answer>((resolve, reject) => {
    resolveAnswer = resolve;
    rejectAnswer = reject;
  });
  // 消费方可能不 await answer(如先 for-await deltas 再取),避免未处理拒绝告警。
  answer.catch(() => {});

  async function* textDeltas(): AsyncIterable<string> {
    let body = "";
    let pending = "";
    let tail: string | null = null;
    try {
      for await (const chunk of source) {
        if (tail !== null) {
          tail += chunk;
          continue;
        }
        pending += chunk;
        const markerAt = pending.indexOf(ANSWER_CITATIONS_MARKER);
        if (markerAt >= 0) {
          const before = pending.slice(0, markerAt);
          tail = pending.slice(markerAt + ANSWER_CITATIONS_MARKER.length);
          pending = "";
          if (before.length > 0) {
            body += before;
            yield before;
          }
          continue;
        }
        const hold = markerPrefixLength(pending);
        const safe = pending.slice(0, pending.length - hold);
        if (safe.length > 0) {
          body += safe;
          pending = pending.slice(safe.length);
          yield safe;
        }
      }

      if (tail === null) {
        if (pending.length > 0) {
          body += pending;
          yield pending;
        }
        throw new AIError(
          "AI_INVALID_RESPONSE",
          `模型输出缺少引用尾部标记 ${ANSWER_CITATIONS_MARKER}`,
        );
      }

      resolveAnswer({ answer: body.trim(), ...parseTail(tail) });
    } catch (err) {
      rejectAnswer(err);
      throw err;
    }
  }

  return { textDeltas: textDeltas(), answer };
}

/** pending 末尾与标记开头的最长重叠长度(即必须扣留、暂不吐出的字符数)。 */
function markerPrefixLength(pending: string): number {
  const max = Math.min(pending.length, ANSWER_CITATIONS_MARKER.length - 1);
  for (let k = max; k > 0; k--) {
    if (ANSWER_CITATIONS_MARKER.startsWith(pending.slice(pending.length - k))) {
      return k;
    }
  }
  return 0;
}

function parseTail(tail: string): {
  citations: Answer["citations"];
  insufficientEvidence: boolean;
} {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(tail));
  } catch (err) {
    throw new AIError("AI_INVALID_RESPONSE", "引用尾部不是合法 JSON", { cause: err });
  }
  const parsed = TailSchema.safeParse(json);
  if (!parsed.success) {
    throw new AIError("AI_INVALID_RESPONSE", "引用尾部不符合 Schema", { cause: parsed.error });
  }
  return parsed.data;
}

/** 与 gateway 同款:剥掉模型偶尔加上的 ```json 围栏。 */
function stripCodeFence(text: string): string {
  const match = text.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/);
  return match ? (match[1] ?? "") : text.trim();
}
