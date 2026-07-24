import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_FILE_BYTES, PROCESSING_ERROR_CODES } from "@doc-pilot/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PipelineError } from "./errors";
import { exceedsFileSizeLimit, parseDocument } from "./parse";

// 用 truncate 制造稀疏文件:逻辑大小达标(stat.size 可见)但不占真实磁盘,
// 避免测试真写 50MB+ 数据。
async function makeFileOfSize(dir: string, name: string, bytes: number): Promise<string> {
  const filePath = join(dir, name);
  await writeFile(filePath, "");
  await truncate(filePath, bytes);
  return filePath;
}

describe("parseDocument 文件大小复核(三层限额的最后一层)", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "parse-size-"));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("超过 MAX_FILE_BYTES 的文件抛不可重试的 FILE_SIZE_LIMIT_EXCEEDED", async () => {
    const filePath = await makeFileOfSize(dir, "oversized.pdf", MAX_FILE_BYTES + 1);

    const err = await parseDocument({ filePath, mimeType: "application/pdf" }).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(PipelineError);
    expect(err).toMatchObject({
      code: PROCESSING_ERROR_CODES.FILE_SIZE_LIMIT_EXCEEDED,
      retryable: false,
    });
  });
});

// 边界语义由纯函数直接钉住:恰好等于上限放行(取 > 而非 >=)。
// 不走 parseDocument——为此真解析一个 50MB 稀疏夹具,pdf.js 在 CI 上扫描会超时。
describe("exceedsFileSizeLimit 边界", () => {
  it("恰好等于 MAX_FILE_BYTES 不超限(边界取 >)", () => {
    expect(exceedsFileSizeLimit(MAX_FILE_BYTES)).toBe(false);
  });

  it("超出 1 字节即超限", () => {
    expect(exceedsFileSizeLimit(MAX_FILE_BYTES + 1)).toBe(true);
  });
});
