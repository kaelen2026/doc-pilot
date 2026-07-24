import { describe, expect, it } from "vitest";
import {
  FCM_DEVICE_TOKEN,
  PUSH_DEVICE_TOKEN,
  PUSH_ENVIRONMENT,
  PUSH_PLATFORM,
  PUSH_TEST_MESSAGE,
} from "./push";

describe("设备令牌边界", () => {
  it("经典 APNS 令牌(32 字节 = 64 hex)落在 APNS 边界内", () => {
    expect(PUSH_DEVICE_TOKEN.minLength).toBeLessThanOrEqual(64);
    expect(PUSH_DEVICE_TOKEN.maxLength).toBeGreaterThanOrEqual(64);
  });

  it("APNS 与 FCM 的边界都成区间(min < max),且 FCM 上限不窄于 APNS", () => {
    expect(PUSH_DEVICE_TOKEN.minLength).toBeLessThan(PUSH_DEVICE_TOKEN.maxLength);
    expect(FCM_DEVICE_TOKEN.minLength).toBeLessThan(FCM_DEVICE_TOKEN.maxLength);
    expect(FCM_DEVICE_TOKEN.maxLength).toBeGreaterThanOrEqual(PUSH_DEVICE_TOKEN.maxLength);
  });
});

describe("平台与环境枚举(VARCHAR 落库,值即 wire 格式)", () => {
  it("平台取值稳定且互不重复", () => {
    expect(PUSH_PLATFORM.ios).toBe("ios");
    expect(PUSH_PLATFORM.android).toBe("android");
    expect(PUSH_PLATFORM.ios).not.toBe(PUSH_PLATFORM.android);
  });

  it("环境取值为 sandbox / production(注册时与构建的 aps-environment 对应,错配即 BadDeviceToken)", () => {
    expect(PUSH_ENVIRONMENT.sandbox).toBe("sandbox");
    expect(PUSH_ENVIRONMENT.production).toBe("production");
  });
});

describe("测试推送文案上限", () => {
  it("标题与正文上限为正,且标题上限不大于正文上限", () => {
    expect(PUSH_TEST_MESSAGE.titleMax).toBeGreaterThan(0);
    expect(PUSH_TEST_MESSAGE.bodyMax).toBeGreaterThanOrEqual(PUSH_TEST_MESSAGE.titleMax);
  });
});
