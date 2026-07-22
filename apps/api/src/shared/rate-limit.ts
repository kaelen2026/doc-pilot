import { RATE_LIMITS, type RateLimitRule } from "@doc-pilot/contracts";
import type { Context, MiddlewareHandler } from "hono";
import { consumeTokenBucket, type TokenBucketState } from "./token-bucket";
import type { AppEnv } from "./types";

export interface RateLimitResult {
  allowed: boolean;
  /** 结算后剩余令牌(下取整)。 */
  remaining: number;
  /** 被拒时距离恢复的毫秒数;允许时为 0。 */
  retryAfterMs: number;
  /** 桶容量(用于 RateLimit-Limit 响应头)。 */
  limit: number;
}

export interface RateLimiter {
  consume(key: string, rule: RateLimitRule, cost?: number): Promise<RateLimitResult>;
}

/**
 * 令牌桶 Lua 脚本。KEYS[1]=桶 key;ARGV=capacity, refill, intervalMs, now, cost。
 * 原子结算,保证多 API 实例下计数一致(cross-cutting §27.1)。返回
 * { allowed(0/1), remaining(下取整), retryAfterMs }。逻辑与 token-bucket.ts 对齐。
 */
const TOKEN_BUCKET_LUA = `
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local interval = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local cost = tonumber(ARGV[5])

local data = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then
  tokens = capacity
  ts = now
end

local elapsed = now - ts
if elapsed < 0 then elapsed = 0 end
tokens = math.min(capacity, tokens + (elapsed / interval) * refill)

local allowed = 0
local retry = 0
if tokens >= cost then
  allowed = 1
  tokens = tokens - cost
else
  retry = math.ceil(((cost - tokens) / refill) * interval)
end

redis.call('HMSET', KEYS[1], 'tokens', tokens, 'ts', now)
-- TTL:从空桶攒满 + 一个 interval 的裕量,单位秒。
local ttl = math.ceil((capacity / refill) * interval / 1000) + math.ceil(interval / 1000)
redis.call('PEXPIRE', KEYS[1], ttl * 1000)

return { allowed, math.floor(tokens), retry }
`;

/** ioredis 的最小结构化接口(避免 API 直接耦合具体客户端类型)。 */
export interface RedisLike {
  defineCommand(name: string, opts: { numberOfKeys: number; lua: string }): void;
  // biome-ignore lint/suspicious/noExplicitAny: 自定义命令由 defineCommand 动态注入。
  [command: string]: any;
}

/** 生产实现:Redis + Lua 原子令牌桶。 */
export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: RedisLike) {
    redis.defineCommand("docpilotTokenBucket", { numberOfKeys: 1, lua: TOKEN_BUCKET_LUA });
  }

  async consume(key: string, rule: RateLimitRule, cost = 1): Promise<RateLimitResult> {
    const [allowed, remaining, retryAfterMs] = (await this.redis.docpilotTokenBucket(
      key,
      rule.capacity,
      rule.refillTokens,
      rule.intervalMs,
      Date.now(),
      cost,
    )) as [number, number, number];
    return { allowed: allowed === 1, remaining, retryAfterMs, limit: rule.capacity };
  }
}

/** 内存实现:仅供测试与单实例本地回退,不跨进程共享。 */
export class InMemoryRateLimiter implements RateLimiter {
  private readonly buckets = new Map<string, TokenBucketState>();
  constructor(private readonly now: () => number = () => Date.now()) {}

  async consume(key: string, rule: RateLimitRule, cost = 1): Promise<RateLimitResult> {
    const outcome = consumeTokenBucket(this.buckets.get(key) ?? null, rule, this.now(), cost);
    this.buckets.set(key, outcome.state);
    return {
      allowed: outcome.allowed,
      remaining: outcome.remaining,
      retryAfterMs: outcome.retryAfterMs,
      limit: rule.capacity,
    };
  }
}

/** 空实现:始终放行。createApp 未注入 limiter 时的默认值(仅单测/嵌入场景)。 */
export class NoopRateLimiter implements RateLimiter {
  async consume(_key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    return { allowed: true, remaining: rule.capacity, retryAfterMs: 0, limit: rule.capacity };
  }
}

function applyHeaders(c: Context<AppEnv>, result: RateLimitResult): void {
  c.header("RateLimit-Limit", String(result.limit));
  c.header("RateLimit-Remaining", String(Math.max(0, result.remaining)));
  if (!result.allowed) {
    c.header("Retry-After", String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))));
  }
}

const TOO_MANY = { error: "rate_limited", message: "请求过于频繁,请稍后再试" } as const;

/**
 * 通用限流中间件工厂。key 返回 null 时跳过(如无法解析主体标识)。
 * 命中上限返回 429 + Retry-After。
 */
export function rateLimit(deps: {
  limiter: RateLimiter;
  rule: RateLimitRule;
  /** 限流维度名,用于组装 key,如 upload / ask。 */
  name: string;
  /** 从请求上下文解析限流主体(如用户 id);返回 null 跳过限流。 */
  subject: (c: Context<AppEnv>) => string | null;
}): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const subject = deps.subject(c);
    if (subject === null) return next();
    const result = await deps.limiter.consume(`rl:${deps.name}:${subject}`, deps.rule);
    applyHeaders(c, result);
    if (!result.allowed) return c.json(TOO_MANY, 429);
    return next();
  };
}

/** 从代理头解析来源 IP,取第一跳;都缺失时回退 "unknown"(共享桶,仍能限制聚合滥用)。 */
function clientIp(c: Context<AppEnv>): string {
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return c.req.header("x-real-ip")?.trim() || "unknown";
}

/** Better Auth 设备授权取码端点后缀(basePath 为 /api/auth)。 */
const DEVICE_CODE_PATH = "/device/code";

/**
 * 扫码登录取码限流:未认证端点,按来源 IP 限流,防止有人狂刷 device_code 撑爆表。
 * 仅拦截 POST /api/auth/device/code,其余 /api/auth/* 放行。必须挂在 auth.handler 之前。
 */
export function deviceCodeRateLimit(limiter: RateLimiter): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.req.method !== "POST" || !c.req.path.endsWith(DEVICE_CODE_PATH)) return next();

    const result = await limiter.consume(`rl:scan-code:${clientIp(c)}`, RATE_LIMITS.scanLoginCode);
    applyHeaders(c, result);
    if (!result.allowed) return c.json(TOO_MANY, 429);
    return next();
  };
}

/** Better Auth 发送验证码端点后缀(basePath 为 /api/auth)。 */
const OTP_SEND_PATH = "/email-otp/send-verification-otp";

/**
 * 登录验证码限流:按邮箱 5 次/小时。仅拦截 Better Auth 的发码端点,
 * 其余 /api/auth/* 请求放行。必须挂在 auth.handler 之前。
 * 通过 clone 读取 body,不消费原始请求流(交给 auth.handler)。
 */
export function otpRateLimit(limiter: RateLimiter): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.req.method !== "POST" || !c.req.path.endsWith(OTP_SEND_PATH)) return next();

    let email: string | null = null;
    try {
      const body = (await c.req.raw.clone().json()) as { email?: unknown };
      if (typeof body?.email === "string" && body.email.trim()) {
        email = body.email.trim().toLowerCase();
      }
    } catch {
      email = null;
    }
    if (!email) return next();

    const result = await limiter.consume(`rl:otp:${email}`, RATE_LIMITS.loginOtp);
    applyHeaders(c, result);
    if (!result.allowed) return c.json(TOO_MANY, 429);
    return next();
  };
}
