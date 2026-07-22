import { describe, expect, it, vi } from "vitest";
import { createAuthPlugins } from "./auth-plugins";

describe("createAuthPlugins", () => {
  it("接入邮箱 OTP、签名 Bearer Session 与设备授权(扫码登录)", () => {
    const plugins = createAuthPlugins({ sendOtpEmail: vi.fn() });

    expect(plugins.map((plugin) => plugin.id)).toEqual([
      "email-otp",
      "bearer",
      "device-authorization",
    ]);
  });
});
