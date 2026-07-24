import { expect, type Page, test } from "@playwright/test";
import { loginViaOtp } from "../helpers/auth";

/**
 * 视觉回归基线:墨水纸设计系统的像素门禁(登录页 / 文档列表空态 / 账户页 × 双主题)。
 * 双视口矩阵由 playwright.config.ts 的 visual-desktop / visual-mobile 两个 project 提供。
 *
 * 基线只认 Linux(CI 平台):Literata 仅拉丁字形,中文走系统衬线兜底,macOS 本地
 * 与 Linux 的字体渲染必然不同,故非 Linux 直接跳过。基线引导/更新流程见 e2e/README.md。
 *
 * 确定性策略:每次运行注册全新用户(空文档列表、单登录会话、零用量,布局逐次运行
 * 恒定),剩余的动态文本(邮箱、日期、随机用户名)用 mask 盖住,不参与像素对比。
 */
test.skip(process.platform !== "linux", "视觉基线只认 Linux(CI),更新流程见 e2e/README.md");

const THEMES = ["light", "dark"] as const;

// 账户页内容高于视口,且滚动发生在工作台外壳的内容区里(外壳 h-dvh、文档自身不滚),
// fullPage 截图拍不到折叠部分——故截账户页时临时把视口拉高到能纳下全部六个分区。
const ACCOUNT_VIEWPORT_HEIGHT: Record<string, number> = {
  "visual-desktop": 2000,
  "visual-mobile": 2800,
};

/**
 * 首帧前把主题选择写进 localStorage(键与 apps/web/features/theme/theme.ts 的
 * THEME_STORAGE_KEY 一致),layout 的无闪烁内联脚本会将其落到 <html data-theme>;
 * 每次 goto 后由调用方断言 data-theme 已生效,键名漂移会立即暴露。
 */
async function chooseTheme(page: Page, theme: (typeof THEMES)[number]): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem("docpilot-theme", value);
  }, theme);
}

/** 截图前稳定化:等 web 字体全部就绪,并隐藏 Next dev 工具浮标(仅 dev 模式存在)。 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

test("关键页视觉基线:登录 / 文档列表空态 / 账户(浅色 + 深色)", async ({ page }, testInfo) => {
  for (const theme of THEMES) {
    await chooseTheme(page, theme);
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("button", { name: "发送验证码" })).toBeVisible();
    await settle(page);
    await expect.soft(page).toHaveScreenshot(`login-${theme}.png`);
  }

  const email = `visual-${Date.now()}@example.com`;
  await loginViaOtp(page, email);

  // 动态文本区,盖掉不参与对比:邮箱(侧栏账户块 + 资料区展示名与邮箱行)、
  // 加入时间、随机生成的公开主页用户名、会话登录日期。匹配不到的 mask 会被忽略,
  // 故三份截图共用同一组。
  const mask = [
    page.getByText(email),
    page.getByText(/年 \d{1,2} 月加入/),
    page.getByText(/^公开主页：/),
    page.getByText(/^登录于 /),
  ];

  for (const theme of THEMES) {
    await chooseTheme(page, theme);

    await page.goto("/documents");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByText("还没有文档。上传一个 PDF 开始。")).toBeVisible();
    await settle(page);
    await expect.soft(page).toHaveScreenshot(`documents-empty-${theme}.png`, { mask });

    const viewport = page.viewportSize();
    if (!viewport) {
      throw new Error("visual project 未配置固定视口");
    }
    await page.setViewportSize({
      width: viewport.width,
      height: ACCOUNT_VIEWPORT_HEIGHT[testInfo.project.name] ?? 2000,
    });
    await page.goto("/account");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    // 两个最慢的数据分区(登录设备 / 用量)都到位才截,避免拍到加载态。
    await expect(page.getByText("本机")).toBeVisible();
    await expect(page.getByText("存储空间", { exact: true })).toBeVisible();
    await settle(page);
    await expect.soft(page).toHaveScreenshot(`account-${theme}.png`, { mask });
    await page.setViewportSize(viewport);
  }
});
