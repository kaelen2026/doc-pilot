import { describe, expect, it } from "vitest";
import { errorMessage, requireOk } from "./api-client";

/** 构造一个带 JSON body 的响应(默认非 2xx),用于钉错误信息抽取。 */
function jsonResponse(body: unknown, status = 400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("errorMessage", () => {
  it("优先取 body.message", async () => {
    expect(await errorMessage(jsonResponse({ message: "配额超限", error: "QUOTA" }))).toBe(
      "配额超限",
    );
  });

  it("无 message 时退回 body.error", async () => {
    expect(await errorMessage(jsonResponse({ error: "UNAUTHORIZED" }))).toBe("UNAUTHORIZED");
  });

  it("message 与 error 都缺时退回 HTTP 状态码", async () => {
    expect(await errorMessage(jsonResponse({}, 503))).toBe("HTTP 503");
  });

  it("body 非 JSON 也不抛,退回 HTTP 状态码", async () => {
    expect(await errorMessage(new Response("<html>502</html>", { status: 502 }))).toBe("HTTP 502");
  });
});

describe("requireOk", () => {
  it("2xx 原样返回同一响应(便于链式取 body)", async () => {
    const r = new Response(JSON.stringify({ ok: true }), { status: 200 });
    expect(await requireOk(r)).toBe(r);
  });

  it("非 2xx 抛 Error,信息由 errorMessage 决定", async () => {
    await expect(requireOk(jsonResponse({ message: "文档不存在" }, 404))).rejects.toThrow(
      "文档不存在",
    );
  });
});
