import { beforeEach, describe, expect, it, vi } from "vitest";

// scopedDocumentRepo 返回单例 mock,便于断言方法调用(workspaceId 已被工厂闭包捕获)。
const mockRepo = vi.hoisted(() => ({
  findByOwnerIdempotency: vi.fn(),
  findReadyByChecksum: vi.fn(),
  insertDocument: vi.fn(),
  findById: vi.fn(),
  getStatusById: vi.fn(),
  list: vi.fn(),
  completeUploadTx: vi.fn(),
}));
const scopedDocumentRepo = vi.hoisted(() => vi.fn(() => mockRepo));

vi.mock("./document.repository", () => ({ scopedDocumentRepo }));
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
import { createUpload } from "./document.service";

const INPUT = { filename: "a.pdf", contentType: "application/pdf", sizeBytes: 100 };

beforeEach(() => {
  vi.clearAllMocks();
  mockRepo.findByOwnerIdempotency.mockResolvedValue(undefined);
});

describe("createUpload 内容去重（§23.4）", () => {
  it("命中同 workspace 已就绪文档:返回 duplicate,不建行、不计配额、不签发上传 URL", async () => {
    mockRepo.findReadyByChecksum.mockResolvedValue({ id: "existing", status: "ready" });

    const res = await createUpload({
      workspaceId: "w1",
      ownerId: "u1",
      input: { ...INPUT, checksumSha256: "abc" },
    });

    expect(res).toEqual({ document: { id: "existing", status: "ready" }, duplicate: true });
    expect(res.upload).toBeUndefined();
    expect(mockRepo.insertDocument).not.toHaveBeenCalled();
    expect(assertUploadQuota).not.toHaveBeenCalled();
  });

  it("未命中:照常计配额、建行、签发上传 URL", async () => {
    mockRepo.findReadyByChecksum.mockResolvedValue(undefined);
    mockRepo.insertDocument.mockResolvedValue({
      id: "new",
      status: "pending_upload",
      processingVersion: 1,
    });

    const res = await createUpload({
      workspaceId: "w1",
      ownerId: "u1",
      input: { ...INPUT, checksumSha256: "abc" },
    });

    expect(assertUploadQuota).toHaveBeenCalledOnce();
    expect(mockRepo.insertDocument).toHaveBeenCalledOnce();
    expect(res.duplicate).toBeUndefined();
    expect(res.upload?.method).toBe("PUT");
    expect(res.document.id).toBe("new");
  });

  it("未带 checksum:跳过去重查找,走正常创建", async () => {
    mockRepo.insertDocument.mockResolvedValue({
      id: "new2",
      status: "pending_upload",
      processingVersion: 1,
    });

    await createUpload({ workspaceId: "w1", ownerId: "u1", input: INPUT });

    expect(mockRepo.findReadyByChecksum).not.toHaveBeenCalled();
    expect(mockRepo.insertDocument).toHaveBeenCalledOnce();
  });

  it("租户作用域:仓库按当前 workspace 构造,幂等查找不再手传 workspaceId(租户隔离)", async () => {
    mockRepo.insertDocument.mockResolvedValue({
      id: "new3",
      status: "pending_upload",
      processingVersion: 1,
    });

    await createUpload({
      workspaceId: "w1",
      ownerId: "u1",
      idempotencyKey: "key-1",
      input: INPUT,
    });

    // 回归护栏:租户边界由工厂构造注入,漏掉 workspace 时同一 owner 跨 workspace 会串号。
    expect(scopedDocumentRepo).toHaveBeenCalledWith("w1");
    expect(mockRepo.findByOwnerIdempotency).toHaveBeenCalledWith("u1", "key-1");
  });
});
