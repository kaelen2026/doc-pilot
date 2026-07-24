import { describe, expect, it } from "vitest";
import { buildParseJobId, JOB_NAMES, QUEUE_NAMES } from "./queue";

describe("buildParseJobId", () => {
  it("生成 pipeline.md §12.2 规定的稳定幂等键格式", () => {
    expect(buildParseJobId("doc-1", 3)).toBe("document:doc-1:version:3:parse");
  });

  it("同文档同版本重复构造得到同一 Job ID(重复发布不建新 Job)", () => {
    expect(buildParseJobId("doc-1", 1)).toBe(buildParseJobId("doc-1", 1));
  });

  it("版本递增产生不同 Job ID(重处理不撞旧 Job 的幂等键)", () => {
    expect(buildParseJobId("doc-1", 1)).not.toBe(buildParseJobId("doc-1", 2));
  });

  it("不同文档互不冲突", () => {
    expect(buildParseJobId("doc-a", 1)).not.toBe(buildParseJobId("doc-b", 1));
  });
});

describe("队列与任务名(持久化进 Redis,改名会孤儿化在途 Job)", () => {
  it("队列名互不重复", () => {
    const values = Object.values(QUEUE_NAMES);
    expect(new Set(values).size).toBe(values.length);
  });

  it("任务名取值稳定", () => {
    expect(JOB_NAMES.processDocument).toBe("process_document");
    expect(JOB_NAMES.reconcile).toBe("reconcile");
    expect(JOB_NAMES.purgeAccount).toBe("purge_account");
  });
});
