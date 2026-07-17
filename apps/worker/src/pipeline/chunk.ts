import { createHash } from "node:crypto";
import {
  CHUNKER_VERSION,
  MAX_CHUNKS_PER_DOCUMENT,
  PARSER_VERSION,
  PROCESSING_ERROR_CODES,
} from "@doc-pilot/contracts";
import { PipelineError } from "./errors";
import { estimateTokens } from "./tokens";
import type { Chunk, CleanedBlock, CleanedDocument } from "./types";

/**
 * 分层切片(见 pipeline.md §15)。纯函数,可单测。
 * 优先级:章节标题 → 段落 → 句子 → Token 硬切分。标题不进正文,只维护 sectionPath。
 */
const TARGET_TOKENS = 700;
const MAX_TOKENS = 1000;
const OVERLAP_TOKENS = 120;
const MIN_TOKENS = 100;

interface Unit {
  text: string;
  page: number;
  tokens: number;
}

interface RawChunk {
  body: string;
  pageStart: number;
  pageEnd: number;
  sectionPath: string[];
}

export function chunkDocument(cleaned: CleanedDocument): Chunk[] {
  const raw = buildRawChunks(cleaned.blocks);
  const merged = mergeSmall(raw);
  const chunks = finalize(merged);

  if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
    throw PipelineError.nonRetryable(
      PROCESSING_ERROR_CODES.CHUNK_LIMIT_EXCEEDED,
      `produced ${chunks.length} chunks, exceeds limit ${MAX_CHUNKS_PER_DOCUMENT}`,
    );
  }
  return chunks;
}

function buildRawChunks(blocks: CleanedBlock[]): RawChunk[] {
  const chunks: RawChunk[] = [];
  const sectionStack: { depth: number; text: string }[] = [];
  let buf: Unit[] = [];
  let bufTokens = 0;

  const sectionPath = () => sectionStack.map((s) => s.text);

  const flush = () => {
    if (buf.length === 0) {
      return;
    }
    chunks.push({
      body: buf.map((u) => u.text).join("\n\n"),
      pageStart: Math.min(...buf.map((u) => u.page)),
      pageEnd: Math.max(...buf.map((u) => u.page)),
      sectionPath: sectionPath(),
    });
    buf = [];
    bufTokens = 0;
  };

  for (const block of blocks) {
    if (block.type === "heading") {
      // 标题即章节边界:先落盘上一节内容,再更新章节栈。
      flush();
      updateSectionStack(sectionStack, block.text);
      continue;
    }
    for (const unit of splitBlock(block)) {
      if (bufTokens > 0 && bufTokens + unit.tokens > MAX_TOKENS) {
        flush();
      }
      buf.push(unit);
      bufTokens += unit.tokens;
      if (bufTokens >= TARGET_TOKENS) {
        flush();
      }
    }
  }
  flush();
  return chunks;
}

/** 过小的尾块并入同章节的上一块(合并后不超过 maxTokens)。 */
function mergeSmall(raw: RawChunk[]): RawChunk[] {
  const out: RawChunk[] = [];
  for (const c of raw) {
    const prev = out[out.length - 1];
    if (
      prev &&
      estimateTokens(c.body) < MIN_TOKENS &&
      samePath(prev.sectionPath, c.sectionPath) &&
      estimateTokens(prev.body) + estimateTokens(c.body) <= MAX_TOKENS
    ) {
      prev.body = `${prev.body}\n\n${c.body}`;
      prev.pageStart = Math.min(prev.pageStart, c.pageStart);
      prev.pageEnd = Math.max(prev.pageEnd, c.pageEnd);
    } else {
      out.push({ ...c });
    }
  }
  return out;
}

/** 加 overlap(仅同章节内),生成最终 chunkIndex / hash / tokenCount。 */
function finalize(raw: RawChunk[]): Chunk[] {
  return raw.map((c, i) => {
    const prev = raw[i - 1];
    const overlap =
      prev && samePath(prev.sectionPath, c.sectionPath) ? takeTail(prev.body, OVERLAP_TOKENS) : "";
    const content = overlap ? `${overlap}\n\n${c.body}` : c.body;
    return {
      chunkIndex: i,
      content,
      contentHash: createHash("sha256").update(content).digest("hex"),
      tokenCount: estimateTokens(content),
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      sectionPath: c.sectionPath,
      metadata: { parserVersion: PARSER_VERSION, chunkerVersion: CHUNKER_VERSION },
    };
  });
}

/** 把块拆成不超过 maxTokens 的单元:先按句子,句子仍超限再按 token 硬切。 */
function splitBlock(block: CleanedBlock): Unit[] {
  const tokens = estimateTokens(block.text);
  if (tokens <= MAX_TOKENS) {
    return [{ text: block.text, page: block.page, tokens }];
  }

  const units: Unit[] = [];
  let buf = "";
  const flush = () => {
    const t = buf.trim();
    if (t) {
      units.push({ text: t, page: block.page, tokens: estimateTokens(t) });
    }
    buf = "";
  };

  for (const sentence of splitSentences(block.text)) {
    for (const piece of hardSplit(sentence)) {
      if (buf && estimateTokens(buf) + estimateTokens(piece) > MAX_TOKENS) {
        flush();
      }
      buf = buf ? `${buf} ${piece}` : piece;
    }
  }
  flush();
  return units;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.。!?！？;；])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 单句仍超 maxTokens 时按字符硬切(近似 4 字符/token)。 */
function hardSplit(sentence: string): string[] {
  if (estimateTokens(sentence) <= MAX_TOKENS) {
    return [sentence];
  }
  const size = MAX_TOKENS * 4;
  const pieces: string[] = [];
  for (let i = 0; i < sentence.length; i += size) {
    pieces.push(sentence.slice(i, i + size));
  }
  return pieces;
}

/** 取正文尾部约 targetTokens 的句子作为 overlap。 */
function takeTail(text: string, targetTokens: number): string {
  const sentences = splitSentences(text);
  const tail: string[] = [];
  let tokens = 0;
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i];
    if (!s) {
      continue;
    }
    tail.unshift(s);
    tokens += estimateTokens(s);
    if (tokens >= targetTokens) {
      break;
    }
  }
  return tail.join(" ");
}

/**
 * 更新章节栈。层级由编号深度推断(如 3.2.1 → 深度 3),无编号标题视为深度 1(新章)。
 * 遇到更浅或同深度的标题,弹出所有 >= 当前深度的项。
 */
function updateSectionStack(stack: { depth: number; text: string }[], heading: string): void {
  const depth = headingDepth(heading);
  let top = stack[stack.length - 1];
  while (top && top.depth >= depth) {
    stack.pop();
    top = stack[stack.length - 1];
  }
  stack.push({ depth, text: heading });
}

function headingDepth(heading: string): number {
  const numbering = heading.match(/^(\d+(?:\.\d+)*)/)?.[1];
  return numbering ? numbering.split(".").length : 1;
}

function samePath(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
