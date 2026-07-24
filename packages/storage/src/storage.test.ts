import { describe, expect, it } from "vitest";
import { storageEnv } from "./env";
import { createPresignedGetUrl, createPresignedPutUrl } from "./storage";

// Presigned URL 的签名在本地计算,不触网,可以廉价钉住 URL 形状与过期语义。
// bucket/endpoint 取自 storageEnv,断言不硬编码具体值,避免测试与环境耦合。
const key = "workspaces/ws_1/documents/doc_1/v1/original.pdf";

describe("createPresignedPutUrl", () => {
  it("URL 指向 bucket 下的目标 Key,并携带自定义有效期", async () => {
    const { url } = await createPresignedPutUrl({
      key,
      contentType: "application/pdf",
      expiresInSeconds: 60,
    });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe(`/${storageEnv.bucket}/${key}`);
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("60");
  });

  it("expiresAt 与有效期一致,落在「现在 + expiresInSeconds」附近", async () => {
    const before = Date.now();
    const { expiresAt } = await createPresignedPutUrl({
      key,
      contentType: "application/pdf",
      expiresInSeconds: 60,
    });
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 60 * 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 60 * 1000);
  });
});

describe("createPresignedGetUrl", () => {
  it("强制 inline + application/pdf,浏览器内嵌渲染而非下载", async () => {
    const { url } = await createPresignedGetUrl({ key, expiresInSeconds: 60 });
    const params = new URL(url).searchParams;
    expect(params.get("response-content-type")).toBe("application/pdf");
    expect(params.get("response-content-disposition")).toBe("inline");
  });

  it("带文件名时按 RFC 5987 编码进 content-disposition,支持非 ASCII 文件名", async () => {
    const { url } = await createPresignedGetUrl({
      key,
      expiresInSeconds: 60,
      filename: "年度报告.pdf",
    });
    const disposition = new URL(url).searchParams.get("response-content-disposition");
    expect(disposition).toBe(`inline; filename*=UTF-8''${encodeURIComponent("年度报告.pdf")}`);
  });
});
