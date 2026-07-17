import { S3Client } from "@aws-sdk/client-s3";

/**
 * S3 兼容客户端。本地指向 MinIO（forcePathStyle=true），生产为 R2 / S3。
 * 构造不建连，import 安全。
 */
export const bucket = process.env.S3_BUCKET ?? "docpilot-private";

export const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "minioadmin",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin",
  },
});
