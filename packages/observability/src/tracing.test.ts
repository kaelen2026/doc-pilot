import { SpanStatusCode, trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { withSpan } from "./tracing";

// 注册真实 TracerProvider + 内存导出器,断言 withSpan 产出的 span 形状
// (状态码、attributes、异常事件),而非仅「调用了 SDK」。
const exporter = new InMemorySpanExporter();

beforeAll(() => {
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
});

afterEach(() => {
  exporter.reset();
});

function finishedSpan(name: string) {
  return exporter.getFinishedSpans().find((s) => s.name === name);
}

describe("withSpan", () => {
  it("返回 fn 的结果,span 置为 OK 并写入 attributes", async () => {
    const result = await withSpan("op.ok", async () => 42, { docId: "d1" });

    expect(result).toBe(42);
    const span = finishedSpan("op.ok");
    expect(span?.status.code).toBe(SpanStatusCode.OK);
    expect(span?.attributes).toMatchObject({ docId: "d1" });
  });

  it("支持同步 fn 并把当前 span 传给它", async () => {
    const result = await withSpan("op.sync", (span) => {
      span.setAttribute("step", "parse");
      return "done";
    });

    expect(result).toBe("done");
    expect(finishedSpan("op.sync")?.attributes).toMatchObject({ step: "parse" });
  });

  it("fn 抛 Error 时记录异常、span 置为 ERROR 并原样重抛", async () => {
    await expect(
      withSpan("op.fail", () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const span = finishedSpan("op.fail");
    expect(span?.status).toMatchObject({ code: SpanStatusCode.ERROR, message: "boom" });
    expect(span?.events.some((e) => e.name === "exception")).toBe(true);
  });

  it("抛出非 Error 值时转为字符串消息后重抛", async () => {
    await expect(withSpan("op.fail-string", () => Promise.reject("oops"))).rejects.toBe("oops");

    expect(finishedSpan("op.fail-string")?.status).toMatchObject({
      code: SpanStatusCode.ERROR,
      message: "oops",
    });
  });

  it("成功与失败两路 span 都会结束(可被导出)", async () => {
    await withSpan("op.end-ok", () => 1);
    await withSpan("op.end-fail", () => {
      throw new Error("x");
    }).catch(() => {});

    // InMemorySpanExporter 只收已 end 的 span;两条都在即证明 finally 收尾生效。
    expect(finishedSpan("op.end-ok")).toBeDefined();
    expect(finishedSpan("op.end-fail")).toBeDefined();
  });
});
