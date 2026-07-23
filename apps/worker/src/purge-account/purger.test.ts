import { describe, expect, it, vi } from "vitest";
import { type PurgeDeps, runPurge } from "./purger";

const CFG = { batchSize: 100 };

/** 构造一组 PurgeDeps 探针,可用 overrides 覆盖任意钩子。 */
function deps(overrides: Partial<PurgeDeps> = {}): PurgeDeps {
  return {
    nowMs: () => 1_000_000,
    listDue: vi.fn(async () => []),
    purgeAndEnqueue: vi.fn(async () => true),
    ...overrides,
  };
}

describe("runPurge", () => {
  it("到期账户:守卫删库并登记待删对象,计入 purged", async () => {
    const d = deps({
      listDue: vi.fn(async () => [{ userId: "u1" }, { userId: "u2" }]),
      purgeAndEnqueue: vi.fn(async () => true),
    });

    const summary = await runPurge(d, CFG);

    expect(summary).toMatchObject({ scanned: 2, purged: 2, skipped: 0 });
    expect(d.purgeAndEnqueue).toHaveBeenCalledTimes(2);
  });

  it("期间被撤销注销(守卫未命中):计入 skipped,不算 purged", async () => {
    const d = deps({
      listDue: vi.fn(async () => [{ userId: "u1" }]),
      purgeAndEnqueue: vi.fn(async () => false), // 撤销后原子 WHERE 命中 0 行
    });

    const summary = await runPurge(d, CFG);

    expect(summary).toMatchObject({ scanned: 1, purged: 0, skipped: 1 });
  });

  it("空批:不调用 purgeAndEnqueue", async () => {
    const d = deps();
    const summary = await runPurge(d, CFG);
    expect(summary).toEqual({ scanned: 0, purged: 0, skipped: 0 });
    expect(d.purgeAndEnqueue).not.toHaveBeenCalled();
  });
});
