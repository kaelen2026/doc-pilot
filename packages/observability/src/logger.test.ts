import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, errToLog } from "./logger";

let out: string[];
let err: string[];

beforeEach(() => {
  out = [];
  err = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    err.push(String(chunk));
    return true;
  });
  delete process.env.LOG_LEVEL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function parse(lines: string[]) {
  return lines.map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("createLogger", () => {
  it("info 写 stdout,含 time/level/event 与字段", () => {
    createLogger().info("doc.uploaded", { documentId: "d1" });
    const [rec] = parse(out);
    expect(rec?.level).toBe("info");
    expect(rec?.event).toBe("doc.uploaded");
    expect(rec?.documentId).toBe("d1");
    expect(typeof rec?.time).toBe("string");
  });

  it("warn/error 走 stderr", () => {
    const log = createLogger();
    log.warn("w");
    log.error("e");
    expect(out).toHaveLength(0);
    expect(parse(err).map((r) => r.level)).toEqual(["warn", "error"]);
  });

  it("child 合并绑定上下文", () => {
    createLogger({ service: "api" }).child({ traceId: "t1" }).info("hit");
    const [rec] = parse(out);
    expect(rec?.service).toBe("api");
    expect(rec?.traceId).toBe("t1");
  });

  it("LOG_LEVEL=warn 时过滤 info/debug", () => {
    process.env.LOG_LEVEL = "warn";
    const log = createLogger();
    log.info("skip");
    log.debug("skip");
    log.warn("keep");
    expect(out).toHaveLength(0);
    expect(err).toHaveLength(1);
  });

  it("超长字符串被截断(不写完整文档/Prompt)", () => {
    createLogger().info("big", { blob: "x".repeat(1000) });
    const [rec] = parse(out);
    expect(String(rec?.blob)).toContain("…[+488]");
    expect(String(rec?.blob).length).toBeLessThan(1000);
  });
});

describe("errToLog", () => {
  it("提取 Error 的 name/message/code", () => {
    const e = Object.assign(new Error("boom"), { code: "AI_TIMEOUT" });
    expect(errToLog(e)).toEqual({ name: "Error", message: "boom", code: "AI_TIMEOUT" });
  });

  it("非 Error 转字符串", () => {
    expect(errToLog("oops")).toEqual({ message: "oops" });
  });
});
