/**
 * 文件与配额限制（见 docs/product/overview.md §2.2）。
 * 必须在三处一致执行：前端预校验、API 创建上传、Worker 解析。
 */
export const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_PAGES = 500;
export const MAX_CHUNKS_PER_DOCUMENT = 5000;
export const STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024; // 1GB / 用户

export const ALLOWED_MIME_TYPES = ["application/pdf"] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMimeType(mime: string): mime is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mime);
}

/**
 * 限流规则(令牌桶,见 docs/architecture/cross-cutting.md §27.1)。
 * - capacity:桶容量,即允许的突发上限。
 * - refillTokens:每 intervalMs 补充的令牌数(稳态速率)。
 * 桶为空时,单个令牌的补充耗时 = intervalMs / refillTokens。
 */
export interface RateLimitRule {
  capacity: number;
  refillTokens: number;
  intervalMs: number;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export const RATE_LIMITS = {
  /** 登录验证码:5 次 / 小时 / 邮箱 */
  loginOtp: { capacity: 5, refillTokens: 5, intervalMs: HOUR_MS },
  /** 上传创建:20 次 / 分钟 / 用户 */
  uploadCreate: { capacity: 20, refillTokens: 20, intervalMs: MINUTE_MS },
  /** 问答:10 次 / 分钟 / 用户 */
  ask: { capacity: 10, refillTokens: 10, intervalMs: MINUTE_MS },
} as const satisfies Record<string, RateLimitRule>;
