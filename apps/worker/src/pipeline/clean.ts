import { createHash } from "node:crypto";
import { PROCESSING_ERROR_CODES } from "@doc-pilot/contracts";
import { PipelineError } from "./errors";
import type { BlockType, CleanedBlock, CleanedDocument, ParsedDocument } from "./types";

/**
 * 文本清洗(见 pipeline.md §14.3)。纯函数,可单测。
 * 步骤:Unicode 归一 → 去页眉页脚/页码 → 合并断行 → 段落切块 → 去连续重复 → 生成 Hash。
 * 关键约束:不能把所有换行都清掉,否则章节结构丢失。
 */
export function cleanDocument(parsed: ParsedDocument): CleanedDocument {
  const pageLines = parsed.pages.map((p) => ({
    page: p.pageNumber,
    lines: normalizeLines(p.text),
  }));

  const running = detectRunningLines(pageLines);

  const blocks: CleanedBlock[] = [];
  for (const { page, lines } of pageLines) {
    // 保留空行(段落边界),只剔除页眉页脚与页码行。
    const kept = lines.filter((l) => !running.has(l) && !isPageNumberLine(l));
    for (const text of assembleParagraphs(kept)) {
      const prev = blocks[blocks.length - 1];
      // 去连续重复文本(同一段落连着出现两次)。
      if (prev && prev.text === text) {
        continue;
      }
      blocks.push({ type: classifyBlock(text), text, page });
    }
  }

  const fullText = blocks.map((b) => b.text).join("\n");
  const textLength = fullText.length;

  if (textLength === 0) {
    throw PipelineError.nonRetryable(
      PROCESSING_ERROR_CODES.EMPTY_DOCUMENT,
      "no extractable text (empty or scanned PDF)",
    );
  }

  return {
    metadata: parsed.metadata,
    pageCount: parsed.metadata.pageCount,
    blocks,
    textLength,
    contentHash: createHash("sha256").update(fullText).digest("hex"),
  };
}

// 控制字符区间:0x00-0x08、0x0B-0x1F、0x7F(排除 0x0A 换行,它是段落边界)。
// biome-ignore lint/suspicious/noControlCharactersInRegex: 清除控制字符正是清洗目标。
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B-\u001F\u007F]/g;
// 行内空白(含不换行空格  ),折叠为单个普通空格。
const INLINE_WS_RE = /[ \t\u00A0]+/g;

/** 归一 + 逐行 trim。保留空行作为段落边界,后续再决定是否合并。 */
function normalizeLines(text: string): string[] {
  const norm = text.normalize("NFKC").replace(/\r\n?/g, "\n").replace(CONTROL_CHARS_RE, "");
  return norm.split("\n").map((l) => l.replace(INLINE_WS_RE, " ").trim());
}

/**
 * 识别贯穿多页的页眉/页脚:统计每页首行与末行,出现在半数以上页面的判定为 running line。
 * 少于 3 页的文档不触发。
 */
function detectRunningLines(pageLines: { page: number; lines: string[] }[]): Set<string> {
  if (pageLines.length < 3) {
    return new Set();
  }
  const counts = new Map<string, number>();
  for (const { lines } of pageLines) {
    const nonEmpty = lines.filter((l) => l !== "");
    const candidates = new Set<string>();
    const first = nonEmpty[0];
    const last = nonEmpty[nonEmpty.length - 1];
    if (first) {
      candidates.add(first);
    }
    if (last) {
      candidates.add(last);
    }
    for (const c of candidates) {
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  const threshold = Math.max(3, Math.ceil(pageLines.length / 2));
  const running = new Set<string>();
  for (const [line, count] of counts) {
    if (count >= threshold) {
      running.add(line);
    }
  }
  return running;
}

const PAGE_NUMBER_RE = /^[-–—\s]*\d{1,4}[-–—\s]*$/;
const PAGE_LABEL_RE = /^(page\s+\d{1,4}|第\s*\d{1,4}\s*页)$/i;

function isPageNumberLine(line: string): boolean {
  return PAGE_NUMBER_RE.test(line) || PAGE_LABEL_RE.test(line);
}

/**
 * 把行合并为段落:空行为边界;行尾连字符(英文换行断词)去连字符直接拼接,
 * 其余同段落行以空格连接。保留段落边界即可,不做跨页合并。
 */
function assembleParagraphs(lines: string[]): string[] {
  const paragraphs: string[] = [];
  let buf = "";

  const flush = () => {
    const t = buf.replace(/\s+/g, " ").trim();
    if (t) {
      paragraphs.push(t);
    }
    buf = "";
  };

  for (const line of lines) {
    if (line === "") {
      flush();
      continue;
    }
    if (buf === "") {
      buf = line;
    } else if (/[A-Za-z]-$/.test(buf)) {
      buf = `${buf.slice(0, -1)}${line}`;
    } else {
      buf = `${buf} ${line}`;
    }
  }
  flush();
  return paragraphs;
}

const HEADING_NUMBER_RE = /^(\d+(\.\d+)*)(\s+|、|\s*[:：])\S/;
const HEADING_CHAPTER_RE = /^第\s*[\d一二三四五六七八九十百零]+\s*[章节篇部回讲]/;
const LIST_ITEM_RE = /^([-*•·]|\d+[.)]|[（(]\d+[)）])\s+/;
const SENTENCE_END_RE = /[.。!?！？;；]$/;

function classifyBlock(text: string): BlockType {
  if (LIST_ITEM_RE.test(text)) {
    return "list";
  }
  // 标题必须是「短的独立一行」。文本抽取常把整页合并成一大段,若不限制长度,
  // 以编号开头的整段正文(如「1 Introduction ...」)会被误判为标题,导致该页没有正文块。
  const isShortLine = text.length <= 80 && !SENTENCE_END_RE.test(text);
  const looksLikeHeading =
    isShortLine &&
    (HEADING_CHAPTER_RE.test(text) || HEADING_NUMBER_RE.test(text) || wordCount(text) <= 8);
  return looksLikeHeading ? "heading" : "paragraph";
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
