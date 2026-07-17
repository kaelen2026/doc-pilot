import type { Job } from "bullmq";

/**
 * document-processing 队列的处理器骨架。
 * Phase 4 起实现流水线：parse → clean → chunk → embed → finalize。
 * 处理前必须校验 processing_version（见 docs/architecture/pipeline.md）。
 */
export async function processDocumentJob(job: Job): Promise<{ ok: boolean }> {
  console.log(`[worker] processing job ${job.id} (${job.name})`);
  return { ok: true };
}
