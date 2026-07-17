import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
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

function isNotFound(err: unknown): boolean {
  const meta = (err as { $metadata?: { httpStatusCode?: number }; name?: string } | null) ?? {};
  return meta.$metadata?.httpStatusCode === 404 || meta.name === "NotFound";
}
