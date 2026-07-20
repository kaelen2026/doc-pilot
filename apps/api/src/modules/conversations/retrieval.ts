import type { CitationSource } from "@doc-pilot/ai";
import { RETRIEVAL } from "@doc-pilot/contracts";
import { apiEnv } from "../../env";

export interface ChunkCandidate {
  chunkId: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  tokenCount: number;
  pageStart: number | null;
  pageEnd: number | null;
  /** 余弦相似度 [0,1](1 - cosineDistance)。 */
  score: number;
}

export interface RetrievedSource extends ChunkCandidate {
  /** 注入 Prompt 的来源标识(S1、S2…),也是引用校验的比对键。 */
  sourceId: string;
}

/**
 * 低成本 rerank(rag.md §17.3):相似度过滤 → 去重 → 按分取 6~8 个,
 * 再受 Context Token Budget 约束(§18.1)。纯函数,便于单测。
 * 最终按 chunkIndex 升序编号注入 Prompt,保持原文阅读顺序。
 *
 * 向量召回(retrieveCandidates)已收编进 scopedConversationRepo:租户/文档/版本过滤
 * 在 seam 里强制注入(ADR-008 + processing_version 守卫)。本文件只保留与租户无关的
 * 纯选择/映射逻辑,不再直连数据库。
 */
export function selectSources(
  candidates: ChunkCandidate[],
  options: {
    maxSources?: number;
    tokenBudget?: number;
    /** 相似度下限。mock 伪向量的分数无语义,本地开发用 0 关闭过滤(见 .env.example)。 */
    minScore?: number;
  } = {},
): RetrievedSource[] {
  const maxSources = options.maxSources ?? RETRIEVAL.maxSources;
  const tokenBudget = options.tokenBudget ?? RETRIEVAL.contextTokenBudget;
  const minScore = options.minScore ?? apiEnv.ragMinScore;

  const seenHash = new Set<string>();
  const picked: ChunkCandidate[] = [];
  let usedTokens = 0;

  for (const candidate of [...candidates].sort((a, b) => b.score - a.score)) {
    if (picked.length >= maxSources) {
      break;
    }
    if (candidate.score < minScore) {
      break; // 已按分数降序,后面只会更低。
    }
    if (seenHash.has(candidate.contentHash)) {
      continue; // 高度重复结果去重。
    }
    if (usedTokens + candidate.tokenCount > tokenBudget) {
      continue; // 超预算的跳过,继续尝试更小的候选。
    }
    seenHash.add(candidate.contentHash);
    usedTokens += candidate.tokenCount;
    picked.push(candidate);
  }

  return picked
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((c, i) => ({ ...c, sourceId: `S${i + 1}` }));
}

/** RetrievedSource → 引用校验用的 CitationSource(citations.ts)。 */
export function toCitationSources(
  sources: RetrievedSource[],
  documentId: string,
): CitationSource[] {
  return sources.map((s) => ({
    sourceId: s.sourceId,
    documentId,
    chunkId: s.chunkId,
    text: s.content,
    pageStart: s.pageStart ?? undefined,
    pageEnd: s.pageEnd ?? undefined,
  }));
}
