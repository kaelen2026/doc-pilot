import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

const API_URL = process.env.E2E_API_URL ?? "http://localhost:3001";
const PDF_PATH = fileURLToPath(new URL("../fixtures/sample.pdf", import.meta.url));

interface CreateUploadResponse {
  document: { id: string; status: string };
  upload: { method: string; url: string; headers: Record<string, string> };
}

/**
 * web 尚无上传 UI(documents 页明确写着「上传功能将在后续阶段接入」),因此 E2E
 * 直接走上传 API 三步:创建文档 + 预签名 URL → 直传字节到 MinIO → 完成上传(入队解析)。
 * 全程复用浏览器上下文的 Session Cookie(page.request 与页面共享 cookie jar)。
 */
export async function uploadDocumentViaApi(page: Page): Promise<{ documentId: string }> {
  const pdf = readFileSync(PDF_PATH);

  const createRes = await page.request.post(`${API_URL}/documents`, {
    data: { filename: "e2e-sample.pdf", contentType: "application/pdf", sizeBytes: pdf.byteLength },
  });
  if (!createRes.ok()) {
    throw new Error(`创建文档失败 ${createRes.status()}: ${await createRes.text()}`);
  }
  const { document, upload } = (await createRes.json()) as CreateUploadResponse;

  const putRes = await page.request.fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    data: pdf,
  });
  if (!putRes.ok()) {
    throw new Error(`直传 MinIO 失败 ${putRes.status()}: ${await putRes.text()}`);
  }

  const completeRes = await page.request.post(
    `${API_URL}/documents/${document.id}/complete-upload`,
  );
  if (!completeRes.ok()) {
    throw new Error(`完成上传失败 ${completeRes.status()}: ${await completeRes.text()}`);
  }

  return { documentId: document.id };
}
