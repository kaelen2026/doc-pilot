import type { RateLimitRule } from "@doc-pilot/contracts";

/** 令牌桶状态。updatedAt 为上次结算的时间戳(ms)。 */
export interface TokenBucketState {
  tokens: number;
  updatedAt: number;
}

export interface TokenBucketOutcome {
  allowed: boolean;
  /** 结算后桶内剩余令牌(已扣减本次消耗)。 */
  remaining: number;
  /** 被拒时,距离攒够所需令牌的毫秒数;允许时为 0。 */
  retryAfterMs: number;
  /** 落库/缓存用的新状态。 */
  state: TokenBucketState;
}

/**
 * 令牌桶结算(纯函数,便于单测,并作为 Redis Lua 脚本的等价参考实现)。
 * 桶按 refillTokens/intervalMs 的速率连续补充,容量封顶 capacity。
 * 未见过的 key 视为满桶。
 */
export function consumeTokenBucket(
  prev: TokenBucketState | null,
  rule: RateLimitRule,
  now: number,
  cost = 1,
): TokenBucketOutcome {
  const state = prev ?? { tokens: rule.capacity, updatedAt: now };
  const elapsed = Math.max(0, now - state.updatedAt);
  const refilled = (elapsed / rule.intervalMs) * rule.refillTokens;
  let tokens = Math.min(rule.capacity, state.tokens + refilled);

  if (tokens >= cost) {
    tokens -= cost;
    return {
      allowed: true,
      remaining: Math.floor(tokens),
      retryAfterMs: 0,
      state: { tokens, updatedAt: now },
    };
  }

  const deficit = cost - tokens;
  const retryAfterMs = Math.ceil((deficit / rule.refillTokens) * rule.intervalMs);
  return {
    allowed: false,
    remaining: Math.floor(tokens),
    retryAfterMs,
    state: { tokens, updatedAt: now },
  };
}
