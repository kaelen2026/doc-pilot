import type { CitationItem } from "./types";

/**
 * 答案正文按 [n] 引用标记切分成段(rag.md §19)。渲染无关的纯逻辑,便于单测:
 * - n 为从 1 开始的引用序号,映射到 citations[n-1](citations 已按 position 升序)。
 * - 越界或无对应引用的 [n] 原样保留为文本段——模型偶发跑偏时正文仍可读,不整条失败。
 * 渲染层(AnswerBody)只负责把段映射成 ReactNode。
 */
export type CitationSegment =
  | { kind: "text"; text: string }
  | { kind: "ref"; n: number; citation: CitationItem };

export function parseCitationSegments(
  content: string,
  citations: CitationItem[],
): CitationSegment[] {
  const segments: CitationSegment[] = [];
  let cursor = 0;
  const re = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: 正则迭代惯用法
  while ((match = re.exec(content)) !== null) {
    const n = Number(match[1]);
    const citation = citations[n - 1];
    if (match.index > cursor) {
      segments.push({ kind: "text", text: content.slice(cursor, match.index) });
    }
    if (citation) {
      segments.push({ kind: "ref", n, citation });
    } else {
      segments.push({ kind: "text", text: match[0] });
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < content.length) {
    segments.push({ kind: "text", text: content.slice(cursor) });
  }
  return segments;
}
