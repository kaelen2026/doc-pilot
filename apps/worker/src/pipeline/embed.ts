import { type AIGateway, type AIMetadata, isAIError } from "@doc-pilot/ai";
import { EMBEDDING_DIMENSIONS, PROCESSING_ERROR_CODES } from "@doc-pilot/contracts";
import { PipelineError } from "./errors";
import type { Chunk } from "./types";

/** 单次 embed 请求的文本条数上限,兼顾请求体大小与失败重试的粒度。 */
const EMBED_BATCH_SIZE = 64;

/** 瞬时故障交给 BullMQ 退避重试;其余 AI 错误重试也不会变好。 */
const TRANSIENT_AI_CODES = new Set(["AI_RATE_LIMITED", "AI_TIMEOUT", "AI_PROVIDER_UNAVAILABLE"]);

export interface EmbeddedChunks {
  /** 与输入 chunks 同序同长。 */
  vectors: number[][];
  /** 实际使用的 embedding 模型(写入 document_chunks.embedding_model)。 */
  model: string;
}

/**
 * embed stage(pipeline.md §13、rag.md):把 Chunk 内容分批送 Gateway embed,
 * 产出与 chunks 对齐的向量。维度必须等于 EMBEDDING_DIMENSIONS,
 * 不符视为模型路由配置错误(不可重试),避免把错维向量写进 pgvector 列。
 */
export async function embedChunks(input: {
  gateway: AIGateway;
  chunks: Chunk[];
  metadata: AIMetadata;
}): Promise<EmbeddedChunks> {
  const vectors: number[][] = [];
  let model = "";

  for (let start = 0; start < input.chunks.length; start += EMBED_BATCH_SIZE) {
    const batch = input.chunks.slice(start, start + EMBED_BATCH_SIZE);
    let result: Awaited<ReturnType<AIGateway["embed"]>>;
    try {
      result = await input.gateway.embed({
        capability: "embedding",
        texts: batch.map((c) => c.content),
        metadata: input.metadata,
      });
    } catch (err) {
      throw toPipelineError(err);
    }

    for (const vector of result.embeddings) {
      if (vector.length !== EMBEDDING_DIMENSIONS) {
        throw PipelineError.nonRetryable(
          PROCESSING_ERROR_CODES.INVALID_CONFIGURATION,
          `embedding 维度 ${vector.length} 与约定 ${EMBEDDING_DIMENSIONS} 不符,请检查模型路由`,
        );
      }
      vectors.push(vector);
    }
    model = result.usage.model;
  }

  return { vectors, model };
}

function toPipelineError(err: unknown): PipelineError {
  if (isAIError(err) && !TRANSIENT_AI_CODES.has(err.code)) {
    return PipelineError.nonRetryable(
      PROCESSING_ERROR_CODES.EMBEDDING_FAILED,
      `${err.code}: ${err.message}`,
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return PipelineError.retryable(PROCESSING_ERROR_CODES.EMBEDDING_FAILED, message);
}
