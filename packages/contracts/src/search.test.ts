import { describe, expect, it } from "vitest";
import { SEARCH } from "./search";

describe("全局搜索契约", () => {
  it("返回的文档结果数不超过向量召回候选数(结果只能从候选里选)", () => {
    expect(SEARCH.maxResults).toBeLessThanOrEqual(SEARCH.candidateLimit);
  });

  it("每文档片段上限至少为 1 且不超过候选总量(0 会让命中文档没有可展示证据)", () => {
    expect(SEARCH.maxPassagesPerDoc).toBeGreaterThanOrEqual(1);
    expect(SEARCH.maxPassagesPerDoc).toBeLessThanOrEqual(SEARCH.candidateLimit);
  });

  it("最小查询长度至少为 1(空串不许触发查询 embedding)", () => {
    expect(SEARCH.minQueryLength).toBeGreaterThanOrEqual(1);
  });

  it("前端防抖为正且不超过 1 秒(既省 embedding 调用又保住即输即搜手感)", () => {
    expect(SEARCH.debounceMs).toBeGreaterThan(0);
    expect(SEARCH.debounceMs).toBeLessThanOrEqual(1_000);
  });
});
