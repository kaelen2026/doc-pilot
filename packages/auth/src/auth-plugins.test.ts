import { describe, expect, it, vi } from "vitest";
import { createAuthPlugins } from "./auth-plugins";

describe("createAuthPlugins", () => {
  it("默认接入邮箱 OTP、签名 Bearer Session 与设备授权(扫码登录),不挂 Google One Tap", () => {
    const plugins = createAuthPlugins({ sendOtpEmail: vi.fn() });

    expect(plugins.map((plugin) => plugin.id)).toEqual([
      "email-otp",
      "bearer",
      "device-authorization",
    ]);
  });

  it("Google 配置齐备时额外挂上 One Tap(复用 socialProviders 的 clientId)", () => {
    const plugins = createAuthPlugins({ sendOtpEmail: vi.fn(), googleOneTap: true });

    expect(plugins.map((plugin) => plugin.id)).toEqual([
      "email-otp",
      "bearer",
      "device-authorization",
      "one-tap",
    ]);
  });
});
