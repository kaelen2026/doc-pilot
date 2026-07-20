import { S3Client } from "@aws-sdk/client-s3";
import { storageEnv } from "./env";

/**
 * S3 兼容客户端。本地指向 MinIO（forcePathStyle=true），生产为 R2 / S3。
 * 构造不建连，import 安全。配置集中于 env.ts。
 */
export const bucket = storageEnv.bucket;

export const s3 = new S3Client({
  region: storageEnv.region,
  endpoint: storageEnv.endpoint,
  forcePathStyle: storageEnv.forcePathStyle,
  credentials: {
    accessKeyId: storageEnv.accessKeyId,
    secretAccessKey: storageEnv.secretAccessKey,
  },
});
