import { expect, test } from "@playwright/test";
import { loginViaOtp } from "../helpers/auth";

/**
 * 用户中心(设置中心)走查:登录 → 头像菜单进入 /account → 六个分区就位 →
 * 改昵称落库 → 主题三态切换 → 登录设备标本机 → 危险区注销走二次确认。
 *
 * 无需真实模型/worker:仅用 web + api(/me、/me/usage)+ better-auth。
 */
test("用户中心:头像菜单进入 → 各分区就位 → 改昵称 → 换主题 → 会话 → 危险区二次确认", async ({
  page,
}) => {
  const email = `account-${Date.now()}@example.com`;

  await test.step("邮箱验证码登录(首登自动注册)", async () => {
    await loginViaOtp(page, email);
  });

  await test.step("经头部头像菜单进入设置中心", async () => {
    await page.getByRole("button", { name: "账户菜单" }).click();
    await page.getByRole("menuitem", { name: "账户设置" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { name: "设置", level: 1 })).toBeVisible();
  });

  await test.step("六个分区标题都渲染", async () => {
    for (const title of ["个人资料", "用量", "工作区", "外观", "登录设备", "危险区"]) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
  });

  await test.step("用量看板列出四项配额维度", async () => {
    for (const dim of ["存储空间", "文档数量", "本月 AI Token", "本月提问"]) {
      await expect(page.getByText(dim, { exact: true })).toBeVisible();
    }
  });

  await test.step("工作区列出首登自动创建的个人空间(owner)", async () => {
    await expect(page.getByText("所有者")).toBeVisible();
  });

  await page.screenshot({ path: "test-results/account-overview.png", fullPage: true });

  await test.step("行内编辑昵称并落库", async () => {
    await page.getByRole("button", { name: "编辑" }).click();
    const input = page.getByLabel("昵称");
    await input.fill("走查昵称");
    await page.getByRole("button", { name: "保存" }).click();
    // 保存成功后退出编辑态,展示区出现新昵称(经 /me 重新拉取)。
    await expect(page.getByRole("main").getByText("走查昵称")).toBeVisible({ timeout: 10_000 });
    await expect(input).toHaveCount(0);
  });

  await test.step("主题切到深色即落到 <html data-theme>", async () => {
    await page.getByRole("button", { name: "深色" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.screenshot({ path: "test-results/account-dark.png", fullPage: true });
    // 切回浅色,验证三态可来回。
    await page.getByRole("button", { name: "浅色" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  await test.step("登录设备列表标出本机", async () => {
    await expect(page.getByText("本机")).toBeVisible();
  });

  await test.step("危险区注销账户走二次确认(点取消,不实际注销)", async () => {
    const deleteBtn = page.getByRole("button", { name: "注销账户" });
    await expect(deleteBtn).toBeEnabled();
    await deleteBtn.click();
    // 二次确认态:出现「确认注销」与「取消」;点「取消」回到初始态,不发起注销请求。
    await expect(page.getByRole("button", { name: "确认注销" })).toBeVisible();
    await page.getByRole("button", { name: "取消" }).click();
    await expect(page.getByRole("button", { name: "注销账户" })).toBeVisible();
  });
});
