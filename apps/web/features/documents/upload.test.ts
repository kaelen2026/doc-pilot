import { MAX_FILE_BYTES } from "@doc-pilot/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadDocument, validateFile } from "./upload";

// validateFile 只读 type/size:用 defineProperty 伪造 size,避免真分配 50MB 内存。
function fileOfSize(size: number, type = "application/pdf"): File {
  const file = new File(["x"], "a.pdf", { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("validateFile(三层限额的前端层)", () => {
  it("非 PDF 类型被拒", () => {
    expect(validateFile(fileOfSize(1024, "image/png"))).toBe("仅支持 PDF 文件");
  });

  it("空文件被拒", () => {
    expect(validateFile(fileOfSize(0))).toBe("文件为空");
  });

  it("超过 MAX_FILE_BYTES 被拒,文案带换算后的 MB 数", () => {
    expect(validateFile(fileOfSize(MAX_FILE_BYTES + 1))).toBe("文件超过 50MB 上限");
  });

  it("恰好等于 MAX_FILE_BYTES 放行(边界取 >,与 API/Worker 层同口径)", () => {
    expect(validateFile(fileOfSize(MAX_FILE_BYTES))).toBeNull();
  });

  it("合法 PDF 返回 null", () => {
    expect(validateFile(fileOfSize(1024))).toBeNull();
  });
});

// uploadDocument 打桩全局 fetch(apiFetch 与直传都最终走它),不劫持模块。
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const pdf = new File(["%PDF-fake"], "报告.pdf", { type: "application/pdf" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadDocument(客户端直传三步,ADR-003)", () => {
  it("内容去重命中:创建即返回已有文档,跳过直传与确认", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { document: { id: "d1" }, duplicate: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadDocument(pdf)).resolves.toEqual({
      documentId: "d1",
      deduplicated: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 创建请求携带内容指纹(SHA256 hex)与文件元数据,这是去重的前提。
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({
      filename: "报告.pdf",
      contentType: "application/pdf",
      sizeBytes: pdf.size,
    });
    expect(body.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("常规路径:创建 → 按预签名参数 PUT 原文件 → 确认入队", async () => {
    const upload = {
      url: "https://storage.local/put-target",
      method: "PUT",
      headers: { "content-type": "application/pdf" },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(200, { document: { id: "d2" }, upload }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadDocument(pdf)).resolves.toEqual({
      documentId: "d2",
      deduplicated: false,
    });

    // 直传必须严格用预签名返回的 url/method/headers,body 是原文件。
    const [putUrl, putInit] = fetchMock.mock.calls[1] ?? [];
    expect(putUrl).toBe(upload.url);
    expect(putInit).toMatchObject({ method: "PUT", headers: upload.headers });
    expect(putInit?.body).toBe(pdf);

    // 第三步确认打到该文档的 complete-upload。
    const [completeUrl, completeInit] = fetchMock.mock.calls[2] ?? [];
    expect(String(completeUrl)).toContain("/documents/d2/complete-upload");
    expect(completeInit).toMatchObject({ method: "POST" });
  });

  it("创建失败时抛出服务端 message,不静默", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(413, { message: "存储配额不足" })),
    );

    await expect(uploadDocument(pdf)).rejects.toThrow("存储配额不足");
  });

  it("直传失败时抛出带 HTTP 状态码的错误", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          document: { id: "d3" },
          upload: { url: "https://storage.local/x", method: "PUT", headers: {} },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadDocument(pdf)).rejects.toThrow("直传存储失败(HTTP 500)");
  });

  it("确认入队失败时抛出服务端错误码文案", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          document: { id: "d4" },
          upload: { url: "https://storage.local/x", method: "PUT", headers: {} },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(500, { error: "INTERNAL" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(uploadDocument(pdf)).rejects.toThrow("INTERNAL");
  });
});
