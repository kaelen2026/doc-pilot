import { mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_FILE_BYTES, PROCESSING_ERROR_CODES } from "@doc-pilot/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PipelineError } from "./errors";
import { parseDocument } from "./parse";

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

  it("恰好等于 MAX_FILE_BYTES 的文件不因大小被拒(边界取 >,继续走解析)", async () => {
    const filePath = await makeFileOfSize(dir, "at-limit.pdf", MAX_FILE_BYTES);

    // 夹具不是合法 PDF,后续解析会以 INVALID_PDF 失败——这里只钉住
    // 「大小校验不拦下恰好等于上限的文件」这一边界。
    const err = await parseDocument({ filePath, mimeType: "application/pdf" }).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(PipelineError);
    expect((err as PipelineError).code).not.toBe(PROCESSING_ERROR_CODES.FILE_SIZE_LIMIT_EXCEEDED);
  });
});
