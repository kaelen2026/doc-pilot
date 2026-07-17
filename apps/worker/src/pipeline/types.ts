/**
 * 解析流水线的内部数据形状(parse → clean → chunk)。
 * 契约层(@doc-pilot/contracts)只放跨进程共享的常量;这里是 Worker 内部类型。
 */

export type BlockType = "heading" | "paragraph" | "list" | "table";

/** 解析阶段的原始产物:逐页纯文本(必须保留页码,见 pipeline.md §14.1)。 */
export interface ParsedPage {
  pageNumber: number;
  text: string;
}

export interface ParsedDocument {
  metadata: {
    title?: string;
    author?: string;
    pageCount: number;
  };
  pages: ParsedPage[];
}

/** 清洗后的语义块,单块归属单页(跨页合并不在 MVP 范围)。 */
export interface CleanedBlock {
  type: BlockType;
  text: string;
  page: number;
}

export interface CleanedDocument {
  metadata: ParsedDocument["metadata"];
  pageCount: number;
  blocks: CleanedBlock[];
  /** 归一化后的正文总字符数(写入 documents.text_length)。 */
  textLength: number;
  /** SHA256(归一化全文),用于判断解析结果是否变化(见 §15.3)。 */
  contentHash: string;
}

export interface Chunk {
  chunkIndex: number;
  content: string;
  contentHash: string;
  tokenCount: number;
  pageStart: number;
  pageEnd: number;
  sectionPath: string[];
  metadata: {
    parserVersion: string;
    chunkerVersion: string;
  };
}
