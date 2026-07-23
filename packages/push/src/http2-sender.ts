import http2 from "node:http2";
import type { ApnsSender } from "./types";

const { HTTP2_HEADER_METHOD, HTTP2_HEADER_PATH, NGHTTP2_CANCEL } = http2.constants;

/**
 * 基于 node:http2 的真实传输实现。APNS 要求 HTTP/2(HTTP/1.1 不受支持),故不能用 fetch。
 *
 * 每次投递开一个短连接:测试推送量极小,无需连接池;真要给全量通知做扇出时再引入
 * 会话复用(scope-guard:本轮只服务 admin 手动测试)。会话/请求错误与超时都会 reject。
 */
export function createHttp2Sender(options: { timeoutMs?: number } = {}): ApnsSender {
  const timeoutMs = options.timeoutMs ?? 10_000;
  return {
    post({ host, path, headers, body }) {
      return new Promise((resolve, reject) => {
        const session = http2.connect(`https://${host}`);
        let settled = false;
        const fail = (err: Error) => {
          if (settled) {
            return;
          }
          settled = true;
          session.close();
          reject(err);
        };
        session.on("error", fail);

        const req = session.request({
          [HTTP2_HEADER_METHOD]: "POST",
          [HTTP2_HEADER_PATH]: path,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body).toString(),
          ...headers,
        });
        req.setTimeout(timeoutMs, () => {
          req.close(NGHTTP2_CANCEL);
          fail(new Error(`APNS 请求超时(${timeoutMs}ms)`));
        });

        let status = 0;
        let respHeaders: Record<string, string | string[] | undefined> = {};
        const chunks: Buffer[] = [];
        req.on("response", (h) => {
          status = Number(h[":status"]);
          respHeaders = h;
        });
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("error", fail);
        req.on("end", () => {
          if (settled) {
            return;
          }
          settled = true;
          session.close();
          resolve({ status, body: Buffer.concat(chunks).toString("utf8"), headers: respHeaders });
        });
        req.end(body);
      });
    },
  };
}
