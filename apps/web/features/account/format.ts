// 用户中心展示用的纯格式化逻辑:与 DOM/框架解耦,单测钉住边界(见 format.test.ts)。
// 字节/百分比这类「复发过边界问题」的换算按 frontend.md 抽到纯函数层。

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** 字节数 → 人类可读(1024 进位),保留至多一位小数并去掉多余的 .0。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  // 保留一位小数后去掉尾随 .0(1.0 → 1),避免 "1.0 KB" 这类噪声。
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${BYTE_UNITS[unit]}`;
}

/** 整数计数 → 千位分组(1234 → "1,234")。 */
export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** used/limit → 取整百分比,钳到 [0,100];上限非正时回退 0 避免除零。 */
export function usagePercent(used: number, limit: number): number {
  if (limit <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((used / limit) * 100));
}

// UA 特征匹配:顺序敏感——Edge 内含 "Chrome"、Chrome 内含 "Safari",故先判更具体的。
const BROWSERS: Array<[RegExp, string]> = [
  [/Edg\//, "Edge"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];

// iOS 要在 Mac 之前判(iPhone/iPad 的 UA 含 "like Mac OS X"),Android 要在 Linux 之前判。
const OSES: Array<[RegExp, string]> = [
  [/Windows/, "Windows"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

function match(ua: string, table: Array<[RegExp, string]>): string | null {
  for (const [re, label] of table) {
    if (re.test(ua)) {
      return label;
    }
  }
  return null;
}

/** session 的 userAgent → "浏览器 · 操作系统";两者都认不出时回退「未知设备」。 */
export function deviceLabel(userAgent: string | null | undefined): string {
  if (!userAgent) {
    return "未知设备";
  }
  const browser = match(userAgent, BROWSERS);
  const os = match(userAgent, OSES);
  const parts = [browser, os].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" · ") : "未知设备";
}
