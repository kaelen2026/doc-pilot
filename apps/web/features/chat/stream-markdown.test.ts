import { describe, expect, it } from "vitest";
import { completeStreamingMarkdown } from "./stream-markdown";

describe("completeStreamingMarkdown", () => {
  it("已闭合的 markdown 原样返回", () => {
    const s = "**粗** 和 `代码` 和 *斜*";
    expect(completeStreamingMarkdown(s)).toBe(s);
  });

  it("未闭合 ** 补上收尾,使前沿立即渲染成粗体(不露出裸 **)", () => {
    expect(completeStreamingMarkdown("见 **安全")).toBe("见 **安全**");
  });

  it("未闭合单 * 补上收尾", () => {
    expect(completeStreamingMarkdown("见 *重要")).toBe("见 *重要*");
  });

  it("未闭合内联代码补上反引号", () => {
    expect(completeStreamingMarkdown("用 `HttpOnly")).toBe("用 `HttpOnly`");
  });

  it("代码未闭合时,其中的 * 不当强调误补", () => {
    expect(completeStreamingMarkdown("看 `a*b")).toBe("看 `a*b`");
  });

  it("开启符恰在末尾(还没内容)则剥离,不闪一下裸符号", () => {
    expect(completeStreamingMarkdown("结论 **")).toBe("结论 ");
    expect(completeStreamingMarkdown("结论 *")).toBe("结论 ");
    expect(completeStreamingMarkdown("运行 `")).toBe("运行 ");
  });

  it("嵌套:粗体内斜体都未闭合,按内层先收尾", () => {
    expect(completeStreamingMarkdown("**粗 *斜")).toBe("**粗 *斜***");
  });

  it("引用标记 [n] 原样不动", () => {
    expect(completeStreamingMarkdown("结论[1] **重要")).toBe("结论[1] **重要**");
  });

  it("空串返回空串", () => {
    expect(completeStreamingMarkdown("")).toBe("");
  });
});
