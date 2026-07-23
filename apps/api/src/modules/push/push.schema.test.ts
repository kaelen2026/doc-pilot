import { describe, expect, it } from "vitest";
import { ValidationError } from "../../shared/errors";
import { parseRegisterDevice } from "./push.schema";

describe("parseRegisterDevice", () => {
  const token = "a".repeat(64);

  it("接受合法输入并把令牌规范化为小写、去空白", () => {
    const out = parseRegisterDevice({
      token: `  ${token.toUpperCase()} `,
      platform: "ios",
      environment: "sandbox",
    });
    expect(out).toEqual({ token, platform: "ios", environment: "sandbox" });
  });

  it("非 hex 令牌被拒", () => {
    expect(() =>
      parseRegisterDevice({ token: "zzzz".repeat(16), platform: "ios", environment: "production" }),
    ).toThrow(ValidationError);
  });

  it("过短 / 过长令牌被拒", () => {
    expect(() =>
      parseRegisterDevice({ token: "ab", platform: "ios", environment: "sandbox" }),
    ).toThrow(ValidationError);
    expect(() =>
      parseRegisterDevice({ token: "a".repeat(500), platform: "ios", environment: "sandbox" }),
    ).toThrow(ValidationError);
  });

  it("未知 platform / environment 被拒", () => {
    expect(() =>
      parseRegisterDevice({ token, platform: "android", environment: "sandbox" }),
    ).toThrow(ValidationError);
    expect(() => parseRegisterDevice({ token, platform: "ios", environment: "prod" })).toThrow(
      ValidationError,
    );
  });

  it("缺字段 / 非对象被拒", () => {
    expect(() => parseRegisterDevice({ platform: "ios", environment: "sandbox" })).toThrow(
      ValidationError,
    );
    expect(() => parseRegisterDevice(null)).toThrow(ValidationError);
    expect(() => parseRegisterDevice("nope")).toThrow(ValidationError);
  });
});
