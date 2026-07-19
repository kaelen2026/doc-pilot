import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { bucket, s3 } from "./client";

const DEFAULT_EXPIRES_SECONDS = Number(process.env.UPLOAD_URL_EXPIRES_SECONDS ?? 900); // 15min

/**
 * 生成客户端直传用的 PUT Presigned URL。
 */
export async function createPresignedPutUrl(input: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<{ url: string; expiresAt: Date }> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ContentType: input.contentType,
  });
  const expiresIn = input.expiresInSeconds ?? DEFAULT_EXPIRES_SECONDS;
  const url = await getSignedUrl(s3, command, { expiresIn });
  return { url, expiresAt: new Date(Date.now() + expiresIn * 1000) };
}

/**
 * 生成浏览器在线阅读用的 GET Presigned URL。
 * 强制 inline + application/pdf，让浏览器内嵌渲染而非下载。
 * 对象由 API 侧完成租户鉴权后才签发（见 ADR-003 的对称做法）。
 */
export async function createPresignedGetUrl(input: {
  key: string;
  expiresInSeconds?: number;
  filename?: string;
}): Promise<{ url: string; expiresAt: Date }> {
  const disposition = input.filename
    ? `inline; filename*=UTF-8''${encodeURIComponent(input.filename)}`
    : "inline";
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ResponseContentType: "application/pdf",
    ResponseContentDisposition: disposition,
  });
  const expiresIn = input.expiresInSeconds ?? DEFAULT_EXPIRES_SECONDS;
  const url = await getSignedUrl(s3, command, { expiresIn });
  return { url, expiresAt: new Date(Date.now() + expiresIn * 1000) };
}

/**
 * HEAD 对象，用于确认直传是否完成并读取真实大小 / 类型。对象不存在返回 null。
 */
export async function headObject(
  key: string,
): Promise<{ sizeBytes: number; contentType: string | undefined } | null> {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { sizeBytes: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch (err) {
    if (isNotFound(err)) {
      return null;
    }
    throw err;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * 将对象流式下载到本地文件(见 pipeline.md §14.2)。
 * Worker 下载原始 PDF 到临时目录后再解析,避免整份文件常驻内存;
 * 目标目录不存在时自动创建。对象不存在会抛错(交由调用方按可重试/不可重试处理)。
 */
export async function downloadObjectToFile(key: string, filePath: string): Promise<void> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) {
    throw new Error(`empty body for object ${key}`);
  }
  await mkdir(dirname(filePath), { recursive: true });
  // SDK v3 在 Node 下返回 Node 可读流,直接 pipe 到文件写入流。
  await pipeline(res.Body as NodeJS.ReadableStream, createWriteStream(filePath));
}

function isNotFound(err: unknown): boolean {
  const meta = (err as { $metadata?: { httpStatusCode?: number }; name?: string } | null) ?? {};
  return meta.$metadata?.httpStatusCode === 404 || meta.name === "NotFound";
}
