import { describe, expect, it, vi } from "vitest";
import { type DrainDeps, runDrain } from "./object-drain";

const CFG = { batchSize: 500, maxAttempts: 10 };

function deps(overrides: Partial<DrainDeps> = {}): DrainDeps {
  return {
    listPending: vi.fn(async () => []),
    deleteStorageObject: vi.fn(async () => {}),
    markDone: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("runDrain", () => {
  it("删除成功:逐条销行,不记失败", async () => {
    const d = deps({
      listPending: vi.fn(async () => [
        { id: "a", objectKey: "k1" },
        { id: "b", objectKey: "k2" },
      ]),
    });

    const summary = await runDrain(d, CFG);

    expect(summary).toMatchObject({ scanned: 2, deleted: 2, failed: 0 });
    expect(d.markDone).toHaveBeenCalledWith("a");
    expect(d.markDone).toHaveBeenCalledWith("b");
    expect(d.markFailed).not.toHaveBeenCalled();
  });

  it("单个删除失败:记 markFailed 留死信,其余继续,不中断", async () => {
    const deleteStorageObject = vi
      .fn<DrainDeps["deleteStorageObject"]>()
      .mockRejectedValueOnce(new Error("s3 down"))
      .mockResolvedValue(undefined);
    const d = deps({
      listPending: vi.fn(async () => [
        { id: "a", objectKey: "k1" },
        { id: "b", objectKey: "k2" },
      ]),
      deleteStorageObject,
    });

    const summary = await runDrain(d, CFG);

    expect(summary).toMatchObject({ scanned: 2, deleted: 1, failed: 1 });
    expect(d.markFailed).toHaveBeenCalledTimes(1);
    expect(d.markFailed).toHaveBeenCalledWith("a", expect.stringContaining("s3 down"));
    expect(d.markDone).toHaveBeenCalledExactlyOnceWith("b");
  });

  it("空队列:不做任何删除", async () => {
    const d = deps();
    const summary = await runDrain(d, CFG);
    expect(summary).toEqual({ scanned: 0, deleted: 0, failed: 0 });
    expect(d.deleteStorageObject).not.toHaveBeenCalled();
  });
});
