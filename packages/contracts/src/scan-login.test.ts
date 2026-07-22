import { describe, expect, it } from "vitest";
import {
  buildScanLoginUri,
  DEVICE_GRANT_TYPE,
  parseScanLoginUserCode,
  SCAN_LOGIN_CLIENT_ID,
  SCAN_LOGIN_URI,
} from "./scan-login";

describe("buildScanLoginUri", () => {
  it("把 user_code 拼成 docpilot 深链(= 插件 verification_uri_complete 形态)", () => {
    expect(buildScanLoginUri("ABCD1234")).toBe(`${SCAN_LOGIN_URI}?user_code=ABCD1234`);
  });

  it("对 user_code 做 URL 编码", () => {
    expect(buildScanLoginUri("A B")).toBe(`${SCAN_LOGIN_URI}?user_code=A+B`);
  });
});

describe("parseScanLoginUserCode", () => {
  it("从完整深链解析出 user_code", () => {
    expect(parseScanLoginUserCode("docpilot://device-login?user_code=ABCD1234")).toBe("ABCD1234");
  });

  it("兼容裸用户码", () => {
    expect(parseScanLoginUserCode("ABCD1234")).toBe("ABCD1234");
  });

  it("裸码两侧空白被裁掉", () => {
    expect(parseScanLoginUserCode("  ABCD1234  ")).toBe("ABCD1234");
  });

  it("与 buildScanLoginUri 往返一致", () => {
    expect(parseScanLoginUserCode(buildScanLoginUri("KLMN6789"))).toBe("KLMN6789");
  });

  it("深链缺少 user_code 参数 → null", () => {
    expect(parseScanLoginUserCode("docpilot://device-login")).toBeNull();
  });

  it("无关文本 / 空串 → null", () => {
    expect(parseScanLoginUserCode("hello world!")).toBeNull();
    expect(parseScanLoginUserCode("")).toBeNull();
    expect(parseScanLoginUserCode("   ")).toBeNull();
  });

  it("其它 URL(无 user_code)→ null", () => {
    expect(parseScanLoginUserCode("https://example.com/device")).toBeNull();
  });
});

describe("常量契约", () => {
  it("grant_type 为 RFC 8628 设备码授权", () => {
    expect(DEVICE_GRANT_TYPE).toBe("urn:ietf:params:oauth:grant-type:device_code");
  });

  it("首方 client_id 稳定", () => {
    expect(SCAN_LOGIN_CLIENT_ID).toBe("docpilot-web");
  });
});
