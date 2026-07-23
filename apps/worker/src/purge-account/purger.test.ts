import { describe, expect, it, vi } from "vitest";
import { type PurgeDeps, runPurge } from "./purger";

const CFG = { batchSize: 100 };

/** 构造一组 PurgeDeps 探针,可用 overrides 覆盖任意钩子。 */
function deps(overrides: Partial<PurgeDeps> = {}): PurgeDeps {
  return {
    nowMs: () => 1_000_000,
    listDue: vi.fn(async () => []),
    collectStorageKeys: vi.fn(async () => []),
    deleteStorageObject: vi.fn(async () => {}),
    purge: vi.fn(async () => true),
    ...overrides,
  };
}

describe("runPurge", () => {
  it("到期账户:先删库成功,再清其对象存储", async () => {
    const d = deps({
      listDue: vi.fn(async () => [{ userId: "u1" }]),
      collectStorageKeys: vi.fn(async () => ["k1", "k2"]),
      purge: vi.fn(async () => true),
    });

    const summary = await runPurge(d, CFG);

    expect(summary).toMatchObject({ scanned: 1, purged: 1, skipped: 0 });
    expect(d.deleteStorageObject).toHaveBeenCalledTimes(2);
    expect(d.deleteStorageObject).toHaveBeenCalledWith("k1");
    expect(d.deleteStorageObject).toHaveBeenCalledWith("k2");
  });

  it("期间被撤销注销(守卫未命中):不删库也绝不动其对象存储", async () => {
    const d = deps({
      listDue: vi.fn(async () => [{ userId: "u1" }]),
      collectStorageKeys: vi.fn(async () => ["k1"]),
      purge: vi.fn(async () => false), // 撤销后原子 WHERE 命中 0 行
    });

    const summary = await runPurge(d, CFG);

    expect(summary).toMatchObject({ scanned: 1, purged: 0, skipped: 1 });
    expect(d.deleteStorageObject).not.toHaveBeenCalled();
  });

  it("对象存储单个删除失败不中断整批", async () => {
    const deleteStorageObject = vi
      .fn<PurgeDeps["deleteStorageObject"]>()
      .mockRejectedValueOnce(new Error("s3 down"))
      .mockResolvedValue(undefined);
    const d = deps({
      listDue: vi.fn(async () => [{ userId: "u1" }]),
      collectStorageKeys: vi.fn(async () => ["k1", "k2"]),
      deleteStorageObject,
    });

    const summary = await runPurge(d, CFG);

    expect(summary).toMatchObject({ purged: 1 });
    expect(deleteStorageObject).toHaveBeenCalledTimes(2); // k1 失败后仍尝试 k2
  });

  it("空批:不做任何删除", async () => {
    const d = deps();
    const summary = await runPurge(d, CFG);
    expect(summary).toEqual({ scanned: 0, purged: 0, skipped: 0 });
    expect(d.purge).not.toHaveBeenCalled();
    expect(d.deleteStorageObject).not.toHaveBeenCalled();
  });
});
