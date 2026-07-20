import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./document.repository");
vi.mock("../quota/quota.service");
vi.mock("@doc-pilot/storage", () => ({
  bucket: "test-bucket",
  buildOriginalObjectKey: () => "ws/doc/v1/original.pdf",
  createPresignedGetUrl: vi.fn(),
  createPresignedPutUrl: vi.fn(async () => ({
    url: "http://storage/put",
    expiresAt: new Date(0),
  })),
  headObject: vi.fn(),
}));

import { assertUploadQuota } from "../quota/quota.service";
import * as repo from "./document.repository";
import { createUpload } from "./document.service";

const INPUT = { filename: "a.pdf", contentType: "application/pdf", sizeBytes: 100 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findByOwnerIdempotency).mockResolvedValue(undefined);
});

describe("createUpload 内容去重（§23.4）", () => {
  it("命中同 workspace 已就绪文档:返回 duplicate,不建行、不计配额、不签发上传 URL", async () => {
    vi.mocked(repo.findReadyByChecksum).mockResolvedValue({ id: "existing", status: "ready" });

    const res = await createUpload({
      workspaceId: "w1",
      ownerId: "u1",
      input: { ...INPUT, checksumSha256: "abc" },
    });

    expect(res).toEqual({ document: { id: "existing", status: "ready" }, duplicate: true });
    expect(res.upload).toBeUndefined();
    expect(repo.insertDocument).not.toHaveBeenCalled();
    expect(assertUploadQuota).not.toHaveBeenCalled();
  });

  it("未命中:照常计配额、建行、签发上传 URL", async () => {
    vi.mocked(repo.findReadyByChecksum).mockResolvedValue(undefined);
    vi.mocked(repo.insertDocument).mockResolvedValue({
      id: "new",
      status: "pending_upload",
      processingVersion: 1,
    } as Awaited<ReturnType<typeof repo.insertDocument>>);

    const res = await createUpload({
      workspaceId: "w1",
      ownerId: "u1",
      input: { ...INPUT, checksumSha256: "abc" },
    });

    expect(assertUploadQuota).toHaveBeenCalledOnce();
    expect(repo.insertDocument).toHaveBeenCalledOnce();
    expect(res.duplicate).toBeUndefined();
    expect(res.upload?.method).toBe("PUT");
    expect(res.document.id).toBe("new");
  });

  it("未带 checksum:跳过去重查找,走正常创建", async () => {
    vi.mocked(repo.insertDocument).mockResolvedValue({
      id: "new2",
      status: "pending_upload",
      processingVersion: 1,
    } as Awaited<ReturnType<typeof repo.insertDocument>>);

    await createUpload({ workspaceId: "w1", ownerId: "u1", input: INPUT });

    expect(repo.findReadyByChecksum).not.toHaveBeenCalled();
    expect(repo.insertDocument).toHaveBeenCalledOnce();
  });

  it("创建幂等查找按 workspace 作用域:workspaceId 必须进查询(租户隔离)", async () => {
    vi.mocked(repo.insertDocument).mockResolvedValue({
      id: "new3",
      status: "pending_upload",
      processingVersion: 1,
    } as Awaited<ReturnType<typeof repo.insertDocument>>);

    await createUpload({
      workspaceId: "w1",
      ownerId: "u1",
      idempotencyKey: "key-1",
      input: INPUT,
    });

    // 回归护栏:漏掉 workspaceId 时,同一 owner 跨 workspace 复用 key 会串到他工作区的文档。
    expect(repo.findByOwnerIdempotency).toHaveBeenCalledWith("w1", "u1", "key-1");
  });
});
