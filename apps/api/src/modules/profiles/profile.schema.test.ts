import { describe, expect, it } from "vitest";
import { parseProfileUpdate } from "./profile.schema";

describe("个人资料输入", () => {
  it("拒绝修改不可变用户名", () => {
    expect(() => parseProfileUpdate({ username: "dp_k7m4q9x2" })).toThrow("username");
  });

  it("拒绝未知社交平台与非 https 链接", () => {
    expect(() => parseProfileUpdate({ socialLinks: { unknown: "https://example.com" } })).toThrow();
    expect(() => parseProfileUpdate({ websiteUrl: "http://example.com" })).toThrow();
  });

  it("修剪并接受合法资料", () => {
    expect(
      parseProfileUpdate({
        name: "  Sam  ",
        bio: "  PDF 爱好者  ",
        location: " 上海 ",
        websiteUrl: "https://example.com",
        socialLinks: { github: "https://github.com/sam" },
      }),
    ).toEqual({
      name: "Sam",
      bio: "PDF 爱好者",
      location: "上海",
      websiteUrl: "https://example.com/",
      socialLinks: { github: "https://github.com/sam" },
    });
  });
});
