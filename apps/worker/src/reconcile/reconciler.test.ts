import { RECONCILE } from "@doc-pilot/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  classifyStaleDocument,
  RECONCILE_ERROR_CODES,
  type ReconcileConfig,
  type ReconcileDeps,
  runReconciliation,
  type StaleDocument,
} from "./reconciler";

const NOW = 1_800_000_000_000;

// 收紧阈值,便于构造边界:queued 1s、processing 5s、pending TTL 10s、最大存活 20s。
const CFG: ReconcileConfig = {
  ...RECONCILE,
  queuedGraceMs: 1_000,
  processingStuckMs: 5_000,
  pendingUploadTtlMs: 10_000,
  maxProcessingAgeMs: 20_000,
};

function doc(over: Partial<StaleDocument> & Pick<StaleDocument, "status">): StaleDocument {
  return {
    documentId: "d1",
    workspaceId: "w1",
    processingVersion: 1,
    updatedAt: new Date(NOW),
    createdAt: new Date(NOW),
    ...over,
  };
}

describe("classifyStaleDocument", () => {
  it("pending_upload:未到 TTL 跳过,超过则判废弃 failed", () => {
    expect(
      classifyStaleDocument(
        doc({ status: "pending_upload", createdAt: new Date(NOW - 9_000) }),
        NOW,
        CFG,
      ),
    ).toEqual({ kind: "skip" });

    const abandoned = classifyStaleDocument(
      doc({ status: "pending_upload", createdAt: new Date(NOW - 11_000) }),
      NOW,
      CFG,
    );
    expect(abandoned).toMatchObject({
      kind: "fail",
      errorCode: RECONCILE_ERROR_CODES.uploadAbandoned,
    });
  });

  it("queued:宽限内跳过,超过则重新入队", () => {
    expect(
      classifyStaleDocument(doc({ status: "queued", updatedAt: new Date(NOW - 500) }), NOW, CFG),
    ).toEqual({ kind: "skip" });
    expect(
      classifyStaleDocument(doc({ status: "queued", updatedAt: new Date(NOW - 2_000) }), NOW, CFG),
    ).toEqual({ kind: "recover" });
  });

  it("processing:未卡住跳过,卡住则重新入队", () => {
    expect(
      classifyStaleDocument(
        doc({ status: "processing", updatedAt: new Date(NOW - 3_000) }),
        NOW,
        CFG,
      ),
    ).toEqual({ kind: "skip" });
    expect(
      classifyStaleDocument(
        doc({ status: "processing", updatedAt: new Date(NOW - 6_000) }),
        NOW,
        CFG,
      ),
    ).toEqual({ kind: "recover" });
  });

  it("处理类文档超过最大存活时长 → 放弃标记 failed(优先于重新入队)", () => {
    const over = classifyStaleDocument(
      doc({
        status: "processing",
        createdAt: new Date(NOW - 21_000),
        updatedAt: new Date(NOW - 6_000),
      }),
      NOW,
      CFG,
    );
    expect(over).toMatchObject({ kind: "fail", errorCode: RECONCILE_ERROR_CODES.timedOut });
  });
});

interface FakeOpts {
  docs: StaleDocument[];
  liveJobIds?: Set<string>;
  recoverResult?: boolean;
  failResult?: boolean;
}

function fakeDeps(opts: FakeOpts) {
  const recover = vi.fn(async (_d: StaleDocument) => opts.recoverResult ?? true);
  const fail = vi.fn(async (_d: StaleDocument, _c: string, _m: string) => opts.failResult ?? true);
  const deps: ReconcileDeps = {
    nowMs: () => NOW,
    listStale: async () => opts.docs,
    hasLiveJob: async (d) => opts.liveJobIds?.has(d.documentId) ?? false,
    recover,
    fail,
  };
  return { deps, recover, fail };
}

describe("runReconciliation", () => {
  it("queued 丢 Job 无存活 Job → 重新入队", async () => {
    const { deps, recover, fail } = fakeDeps({
      docs: [doc({ documentId: "d1", status: "queued", updatedAt: new Date(NOW - 2_000) })],
    });
    const summary = await runReconciliation(deps, CFG);
    expect(recover).toHaveBeenCalledOnce();
    expect(fail).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ scanned: 1, recovered: 1, failed: 0, skipped: 0 });
  });

  it("仍有存活 Job → 跳过,不重新入队", async () => {
    const { deps, recover } = fakeDeps({
      docs: [doc({ documentId: "d1", status: "processing", updatedAt: new Date(NOW - 6_000) })],
      liveJobIds: new Set(["d1"]),
    });
    const summary = await runReconciliation(deps, CFG);
    expect(recover).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ recovered: 0, skipped: 1 });
  });

  it("pending_upload 废弃 → 标记 failed", async () => {
    const { deps, fail } = fakeDeps({
      docs: [
        doc({ documentId: "d1", status: "pending_upload", createdAt: new Date(NOW - 11_000) }),
      ],
    });
    const summary = await runReconciliation(deps, CFG);
    expect(fail).toHaveBeenCalledOnce();
    expect(summary).toMatchObject({ failed: 1, recovered: 0 });
  });

  it("守卫竞态:recover 返回 false(状态已流转)→ 计为跳过", async () => {
    const { deps, recover } = fakeDeps({
      docs: [doc({ documentId: "d1", status: "queued", updatedAt: new Date(NOW - 2_000) })],
      recoverResult: false,
    });
    const summary = await runReconciliation(deps, CFG);
    expect(recover).toHaveBeenCalledOnce();
    expect(summary).toMatchObject({ recovered: 0, skipped: 1 });
  });
});
