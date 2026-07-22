import { expect, type Page } from "@playwright/test";
import { fetchLatestOtp } from "./mailpit";

/**
 * 走真实的邮箱验证码登录(passwordless):首次登录该邮箱会自动注册并建个人
 * Workspace(packages/auth)。验证码从 Mailpit 读取。登录成功后 better-auth
 * 会在 localhost 上种下 Session Cookie,浏览器上下文(含 page.request)后续都带上它。
 */
export async function loginViaOtp(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByRole("button", { name: "发送验证码" }).click();

  // 验证码输入框出现即表示已切到 otp 步骤(邮件已发出)。
  const otpInput = page.getByPlaceholder("邮箱验证码");
  await expect(otpInput).toBeVisible();

  const otp = await fetchLatestOtp(email);
  await otpInput.fill(otp);
  // exact:true:登录页新增「用密码登录」切换按钮(名字含「登录」),非精确匹配会命中两个(#102 起)。
  await page.getByRole("button", { name: "登录", exact: true }).click();

  // 登录成功软导航回首页,已登录态落到文档工作台。退出登录已收进头部头像菜单,
  // 故以工作台标题「我的文档」作为登录完成的稳定信号。
  await expect(page.getByRole("heading", { name: "我的文档" })).toBeVisible({ timeout: 15_000 });
}
