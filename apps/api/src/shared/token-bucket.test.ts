import type { RateLimitRule } from "@doc-pilot/contracts";
import { describe, expect, it } from "vitest";
import { consumeTokenBucket, type TokenBucketState } from "./token-bucket";

const RULE: RateLimitRule = { capacity: 5, refillTokens: 5, intervalMs: 1000 };

describe("consumeTokenBucket", () => {
  it("未见过的 key 视为满桶,可连续消费到容量上限", () => {
    let state: TokenBucketState | null = null;
    const now = 1_000_000;
    for (let i = 0; i < RULE.capacity; i++) {
      const out = consumeTokenBucket(state, RULE, now);
      expect(out.allowed).toBe(true);
      state = out.state;
    }
    // 第 6 次在同一时刻被拒。
    const denied = consumeTokenBucket(state, RULE, now);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  it("被拒时给出攒够一个令牌所需的 retryAfterMs", () => {
    // 桶为空,速率 5/1000ms => 单令牌需要 200ms。
    const empty: TokenBucketState = { tokens: 0, updatedAt: 1000 };
    const out = consumeTokenBucket(empty, RULE, 1000);
    expect(out.allowed).toBe(false);
    expect(out.retryAfterMs).toBe(200);
  });

  it("随时间按速率补充,且不超过容量", () => {
    const empty: TokenBucketState = { tokens: 0, updatedAt: 0 };
    // 过 400ms => 补 2 个令牌,消费 1 个后剩 1。
    const partial = consumeTokenBucket(empty, RULE, 400);
    expect(partial.allowed).toBe(true);
    expect(partial.remaining).toBe(1);

    // 过很久也只补到 capacity。
    const full = consumeTokenBucket(empty, RULE, 10 * RULE.intervalMs);
    expect(full.remaining).toBe(RULE.capacity - 1);
  });

  it("时钟回拨(now < updatedAt)不产生负补充", () => {
    const state: TokenBucketState = { tokens: 2, updatedAt: 5000 };
    const out = consumeTokenBucket(state, RULE, 4000);
    expect(out.allowed).toBe(true);
    expect(out.remaining).toBe(1);
  });
});
