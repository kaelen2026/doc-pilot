import { describe, expect, it } from "vitest";
import {
  nextChoice,
  parseThemeChoice,
  resolveTheme,
  THEME_CHOICES,
  type ThemeChoice,
} from "./theme";

describe("parseThemeChoice", () => {
  it("识别合法的三种选择", () => {
    expect(parseThemeChoice("system")).toBe("system");
    expect(parseThemeChoice("light")).toBe("light");
    expect(parseThemeChoice("dark")).toBe("dark");
  });

  it("非法或空值回退到 system", () => {
    expect(parseThemeChoice(null)).toBe("system");
    expect(parseThemeChoice("")).toBe("system");
    expect(parseThemeChoice("SYSTEM")).toBe("system");
    expect(parseThemeChoice("solarized")).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("显式选择直接生效,忽略系统偏好", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("system 时跟随系统偏好", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("nextChoice", () => {
  it("按 system → light → dark → system 循环", () => {
    expect(nextChoice("system")).toBe("light");
    expect(nextChoice("light")).toBe("dark");
    expect(nextChoice("dark")).toBe("system");
  });

  it("循环覆盖全部三种选择且闭合", () => {
    const seen = new Set<string>();
    let cur: ThemeChoice = THEME_CHOICES[0];
    for (let i = 0; i < THEME_CHOICES.length; i++) {
      seen.add(cur);
      cur = nextChoice(cur);
    }
    expect(seen).toEqual(new Set(THEME_CHOICES));
    expect(cur).toBe(THEME_CHOICES[0]); // 转一圈回到起点
  });
});
