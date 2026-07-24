import { readFile, stat } from "node:fs/promises";
import {
  isAllowedMimeType,
  MAX_FILE_BYTES,
  MAX_PAGES,
  PROCESSING_ERROR_CODES,
} from "@doc-pilot/contracts";
import { extractText, getDocumentProxy, getMeta } from "unpdf";
import { PipelineError } from "./errors";
import type { ParsedDocument } from "./types";

/**
 * 解析器抽象(见 pipeline.md §14.1)。未来可扩展 Word / 扫描件等,
 * Worker 按 mimeType 选择实现。
 */
export interface DocumentParser {
  supports(input: { mimeType: string }): boolean;
  parse(input: { filePath: string; mimeType: string }): Promise<ParsedDocument>;
}

/**
 * 基于 unpdf(内置 pdf.js)的 PDF 解析器。
 * 第一版不还原排版,只保证逐页纯文本 + 页码 + 基本元数据(§14.1)。
 */
/**
 * 大小上限判定抽成纯函数:边界语义(取 > 而非 >=,恰好等于上限放行)由单测直接钉住,
 * 不必为边界用例真解析一个 50MB 夹具(CI 上 pdf.js 扫描 50MB 会超时)。
 */
export function exceedsFileSizeLimit(sizeBytes: number): boolean {
  return sizeBytes > MAX_FILE_BYTES;
}

export class PdfParser implements DocumentParser {
  supports(input: { mimeType: string }): boolean {
    return input.mimeType === "application/pdf";
  }

  async parse(input: { filePath: string }): Promise<ParsedDocument> {
    // Worker 是三层限额的最后一层(见 product/overview.md §22):复核文件字节大小。
    // 用 stat 而非 readFile 后量 buffer:超限文件在读进内存之前就被拒绝,
    // 避免为绕过前两层校验的超大对象分配大 Buffer。
    const { size } = await stat(input.filePath);
    if (exceedsFileSizeLimit(size)) {
      throw PipelineError.nonRetryable(
        PROCESSING_ERROR_CODES.FILE_SIZE_LIMIT_EXCEEDED,
        `file is ${size} bytes, exceeds limit ${MAX_FILE_BYTES}`,
      );
    }

    const bytes = new Uint8Array(await readFile(input.filePath));

    let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
    try {
      pdf = await getDocumentProxy(bytes);
    } catch (err) {
      throw classifyPdfError(err);
    }

    // Worker 是三层限额的最后一层(见 product/overview.md §22):再次校验页数。
    if (pdf.numPages > MAX_PAGES) {
      throw PipelineError.nonRetryable(
        PROCESSING_ERROR_CODES.PAGE_LIMIT_EXCEEDED,
        `PDF has ${pdf.numPages} pages, exceeds limit ${MAX_PAGES}`,
      );
    }

    let perPageText: string[];
    let totalPages: number;
    let info: { Title?: string; Author?: string };
    try {
      // mergePages:false → text 为逐页字符串数组(重载在类型上默认取 string,故显式断言)。
      const extracted = (await extractText(pdf, { mergePages: false })) as {
        totalPages: number;
        text: string[];
      };
      perPageText = extracted.text;
      totalPages = extracted.totalPages;
      const meta = await getMeta(pdf);
      info = (meta.info ?? {}) as { Title?: string; Author?: string };
    } catch (err) {
      throw classifyPdfError(err);
    }

    const pages = perPageText.map((text, i) => ({ pageNumber: i + 1, text }));

    return {
      metadata: {
        title: cleanMeta(info.Title),
        author: cleanMeta(info.Author),
        pageCount: totalPages,
      },
      pages,
    };
  }
}

function cleanMeta(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * 把 pdf.js 的异常映射到处理错误码。加密 / 结构损坏属于不可重试。
 */
function classifyPdfError(err: unknown): PipelineError {
  const name = (err as { name?: string })?.name ?? "";
  const message = err instanceof Error ? err.message : String(err);

  if (name === "PasswordException") {
    return PipelineError.nonRetryable(
      PROCESSING_ERROR_CODES.ENCRYPTED_PDF,
      "PDF is password protected",
    );
  }
  if (name === "InvalidPDFException") {
    return PipelineError.nonRetryable(
      PROCESSING_ERROR_CODES.INVALID_PDF,
      `Invalid PDF: ${message}`,
    );
  }
  // 其它解析异常一律按无法解析处理(重试不会变好)。
  return PipelineError.nonRetryable(
    PROCESSING_ERROR_CODES.INVALID_PDF,
    `PDF parse failed: ${message}`,
  );
}

const pdfParser = new PdfParser();
const PARSERS: DocumentParser[] = [pdfParser];

/**
 * 按 mimeType 选择解析器并解析。无匹配解析器 → 不支持的文件(不可重试)。
 */
export async function parseDocument(input: {
  filePath: string;
  mimeType: string;
}): Promise<ParsedDocument> {
  if (!isAllowedMimeType(input.mimeType)) {
    throw PipelineError.nonRetryable(
      PROCESSING_ERROR_CODES.UNSUPPORTED_FILE,
      `unsupported mime type: ${input.mimeType}`,
    );
  }
  const parser = PARSERS.find((p) => p.supports(input));
  if (!parser) {
    throw PipelineError.nonRetryable(
      PROCESSING_ERROR_CODES.UNSUPPORTED_FILE,
      `no parser for mime type: ${input.mimeType}`,
    );
  }
  return parser.parse(input);
}
