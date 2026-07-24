import { buildParseJobId } from "@doc-pilot/contracts";
import { describe, expect, it } from "vitest";
import { buildParseBullJobId } from "./queues";

// Queue 工厂(getDocumentProcessingQueue / getMaintenanceQueue)需要真实 Redis 连接
// (BullMQ RedisConnection 构造即 init),不在单测覆盖;由 apps/worker 的
// publisher.integration.test.ts 真连验证。这里只钉纯逻辑的 jobId 构造。
describe("buildParseBullJobId", () => {
  it("生成不含冒号的稳定 jobId(BullMQ 不允许 jobId 含冒号)", () => {
    const jobId = buildParseBullJobId("doc-1", 3);

    expect(jobId).toBe("document_doc-1_version_3_parse");
    expect(jobId).not.toContain(":");
  });

  it("与 DB 侧幂等键(buildParseJobId)一一对应,仅分隔符不同", () => {
    // DB 的 processing_jobs.idempotency_key 保留冒号形式;两者必须由同一输入推导,
    // 否则 publisher 与 reconciler 会对不上号。
    expect(buildParseJobId("doc-1", 3)).toBe("document:doc-1:version:3:parse");
    expect(buildParseBullJobId("doc-1", 3)).toBe(buildParseJobId("doc-1", 3).replaceAll(":", "_"));
  });

  it("同一文档不同版本生成不同的 jobId(重处理不与旧任务撞键)", () => {
    expect(buildParseBullJobId("doc-1", 1)).not.toBe(buildParseBullJobId("doc-1", 2));
  });
});
