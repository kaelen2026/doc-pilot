// 本包唯一读取 process.env 的地方。S3/MinIO 凭据与直传参数集中于此,默认值面向本地 MinIO。
export const storageEnv = {
  bucket: process.env.S3_BUCKET ?? "docpilot-private",
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "minioadmin",
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin",
  /** 直传 Presigned URL 有效期(秒),默认 15 分钟。 */
  uploadUrlExpiresSeconds: Number(process.env.UPLOAD_URL_EXPIRES_SECONDS ?? 900),
} as const;
