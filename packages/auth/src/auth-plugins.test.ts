import { describe, expect, it, vi } from "vitest";
import { createAuthPlugins } from "./auth-plugins";

describe("createAuthPlugins", () => {
  it("同时接入邮箱 OTP 与签名 Bearer Session", () => {
    const plugins = createAuthPlugins({ sendOtpEmail: vi.fn() });

    expect(plugins.map((plugin) => plugin.id)).toEqual(["email-otp", "bearer"]);
  });
});
