import { describe, expect, it } from "vitest";
import { deviceLabel, formatBytes, formatCount, usagePercent } from "./format";

describe("formatBytes", () => {
  it("0 字节显示为 0 B", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("不足 1KB 显示整数字节", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("按 1024 进位到 KB,保留一位小数且去掉多余的 .0", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("逐级进位到 MB / GB", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
  });
});

describe("formatCount", () => {
  it("按千位分组", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1234)).toBe("1,234");
    expect(formatCount(1000000)).toBe("1,000,000");
  });
});

describe("usagePercent", () => {
  it("按 used/limit 取整百分比", () => {
    expect(usagePercent(50, 200)).toBe(25);
    expect(usagePercent(1, 3)).toBe(33);
  });

  it("上限为 0 或负时回退 0,避免除零", () => {
    expect(usagePercent(5, 0)).toBe(0);
  });

  it("超额时钳到 100", () => {
    expect(usagePercent(300, 200)).toBe(100);
  });
});

describe("deviceLabel", () => {
  it("解析出浏览器 · 操作系统", () => {
    const chromeMac =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(deviceLabel(chromeMac)).toBe("Chrome · macOS");
  });

  it("Safari 不被 Chrome 的 UA 误判", () => {
    const safariMac =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
    expect(deviceLabel(safariMac)).toBe("Safari · macOS");
  });

  it("识别 Edge / Firefox 与 Windows", () => {
    const edgeWin =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
    expect(deviceLabel(edgeWin)).toBe("Edge · Windows");
    const firefoxWin =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";
    expect(deviceLabel(firefoxWin)).toBe("Firefox · Windows");
  });

  it("识别 iOS 与 Android", () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(deviceLabel(iphone)).toBe("Safari · iOS");
    const android =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    expect(deviceLabel(android)).toBe("Chrome · Android");
  });

  it("空或无法识别时回退未知设备", () => {
    expect(deviceLabel(null)).toBe("未知设备");
    expect(deviceLabel("")).toBe("未知设备");
    expect(deviceLabel("some-cli/1.0")).toBe("未知设备");
  });
});
