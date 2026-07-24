import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { storageEnv } from "./env";
// 走 index.ts 公共入口 import,顺带钉住 barrel 导出面(消费方实际的引用路径)。
import {
  createPresignedGetUrl,
  createPresignedPutUrl,
  deleteObject,
  downloadObjectToFile,
  headObject,
  type ObjectStoreClient,
} from "./index";

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

  it("不传有效期时回退到 env 的默认直传有效期(默认 15 分钟)", async () => {
    const { url } = await createPresignedPutUrl({ key, contentType: "application/pdf" });
    const params = new URL(url).searchParams;
    expect(params.get("X-Amz-Expires")).toBe(String(storageEnv.uploadUrlExpiresSeconds));
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

  it("不传有效期时回退到 env 的默认直传有效期,与 PUT 口径一致", async () => {
    const { url } = await createPresignedGetUrl({ key });
    const params = new URL(url).searchParams;
    expect(params.get("X-Amz-Expires")).toBe(String(storageEnv.uploadUrlExpiresSeconds));
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

// —— 以下操作走注入的手写假 client(鸭子类型满足 send 调用面),不触网、不 vi.mock。——

/** 记录收到的 command 并按脚本返回/抛出,cast 只为满足 SDK 泛型签名。 */
function fakeClient(handler: (command: SentCommand) => Promise<unknown>): {
  client: ObjectStoreClient;
  sent: SentCommand[];
} {
  const sent: SentCommand[] = [];
  const client = {
    send: async (command: SentCommand) => {
      sent.push(command);
      return handler(command);
    },
  } as unknown as ObjectStoreClient;
  return { client, sent };
}

type SentCommand = { input: Record<string, unknown>; constructor: { name: string } };

function s3Error(overrides: { httpStatusCode?: number; name?: string }): Error {
  const err = new Error("s3 error") as Error & { $metadata?: { httpStatusCode?: number } };
  if (overrides.httpStatusCode !== undefined) {
    err.$metadata = { httpStatusCode: overrides.httpStatusCode };
  }
  if (overrides.name !== undefined) {
    err.name = overrides.name;
  }
  return err;
}

describe("headObject", () => {
  it("向 bucket 下的目标 Key 发 HeadObjectCommand,返回真实大小与类型", async () => {
    const { client, sent } = fakeClient(async () => ({
      ContentLength: 1234,
      ContentType: "application/pdf",
    }));
    const res = await headObject(key, client);
    expect(res).toEqual({ sizeBytes: 1234, contentType: "application/pdf" });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.constructor.name).toBe("HeadObjectCommand");
    expect(sent[0]?.input).toMatchObject({ Bucket: storageEnv.bucket, Key: key });
  });

  it("响应缺 ContentLength 时大小回退为 0,类型可为 undefined", async () => {
    const { client } = fakeClient(async () => ({}));
    const res = await headObject(key, client);
    expect(res).toEqual({ sizeBytes: 0, contentType: undefined });
  });

  it("HTTP 404 视为对象不存在,返回 null 而非抛错", async () => {
    const { client } = fakeClient(async () => {
      throw s3Error({ httpStatusCode: 404 });
    });
    await expect(headObject(key, client)).resolves.toBeNull();
  });

  it("错误名为 NotFound 时同样返回 null(SDK 两种 404 形态都要认)", async () => {
    const { client } = fakeClient(async () => {
      throw s3Error({ name: "NotFound" });
    });
    await expect(headObject(key, client)).resolves.toBeNull();
  });

  it("非 404 错误原样上抛,不吞掉", async () => {
    const { client } = fakeClient(async () => {
      throw s3Error({ httpStatusCode: 500, name: "InternalError" });
    });
    await expect(headObject(key, client)).rejects.toMatchObject({ name: "InternalError" });
  });
});

describe("deleteObject", () => {
  it("向 bucket 下的目标 Key 发 DeleteObjectCommand", async () => {
    const { client, sent } = fakeClient(async () => ({}));
    await deleteObject(key, client);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.constructor.name).toBe("DeleteObjectCommand");
    expect(sent[0]?.input).toMatchObject({ Bucket: storageEnv.bucket, Key: key });
  });
});

describe("downloadObjectToFile", () => {
  it("把对象流式写入目标文件,目标目录不存在时自动创建", async () => {
    const dir = await mkdtemp(join(tmpdir(), "storage-test-"));
    try {
      const { client, sent } = fakeClient(async () => ({
        Body: Readable.from(["%PDF-1.7 ", "fake body"]),
      }));
      const filePath = join(dir, "nested", "deeper", "original.pdf");
      await downloadObjectToFile(key, filePath, client);
      expect(sent[0]?.constructor.name).toBe("GetObjectCommand");
      expect(sent[0]?.input).toMatchObject({ Bucket: storageEnv.bucket, Key: key });
      await expect(readFile(filePath, "utf8")).resolves.toBe("%PDF-1.7 fake body");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("响应缺 Body 时抛错并带上对象 Key,便于定位", async () => {
    const { client } = fakeClient(async () => ({ Body: undefined }));
    await expect(downloadObjectToFile(key, "/tmp/never-written.pdf", client)).rejects.toThrow(key);
  });
});
