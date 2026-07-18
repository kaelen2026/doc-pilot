import { expect, test } from "@playwright/test";
import { uploadDocumentViaApi } from "../helpers/api";
import { loginViaOtp } from "../helpers/auth";

/**
 * RAG 问答完整闭环(testing-and-eval.md §30.4)。
 *
 * 登录 → 上传测试 PDF → 等 ready → 提问 → 验证回答与引用 → 点击引用展开原文。
 * 零真实模型:未配置 ANTHROPIC/OPENAI Key 时,worker 的 embed/摘要与 API 的问答都
 * 回落 mock;mock 问答会依据检索到的片段产出一条有效引用(apps/api/src/ai/mock-answer.ts),
 * 因此「回答 + 引用」链路无需真实模型也能跑通。
 *
 * 说明:当前产品面未实现「删除文档」「摘要展示」UI,故 §30.4 里这两步不在本用例内
 * (E2E 不为测试造功能)。
 */
test("注册登录 → 上传 → 就绪 → 提问 → 回答带引用 → 点击展开", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  await test.step("邮箱验证码登录(首登自动注册 + 建 Workspace)", async () => {
    await loginViaOtp(page, email);
  });

  const { documentId } = await test.step("上传测试 PDF(API 直传)", async () => {
    return uploadDocumentViaApi(page);
  });

  await test.step("文档列表轮询到「就绪」", async () => {
    await page.goto("/documents");
    // ready / partially_ready 时该行才出现指向问答页的链接。
    const askLink = page.locator(`a[href="/documents/${documentId}/chat"]`);
    await expect(askLink).toBeVisible({ timeout: 90_000 });
    await askLink.click();
  });

  await test.step("进入问答页并提问", async () => {
    await expect(page).toHaveURL(new RegExp(`/documents/${documentId}/chat`));
    const input = page.getByLabel("提问");
    await expect(input).toBeEnabled({ timeout: 20_000 });
    await input.fill("这份文档讲了什么?");
    await page.getByRole("button", { name: "提问" }).click();
  });

  await test.step("验证回答带有效引用(非拒答)并点击展开原文", async () => {
    // 引用脚注按钮「引 1 …」出现 = 回答已完成且引用校验通过并落库。
    const citation = page.getByRole("button", { name: /^引 1/ });
    await expect(citation).toBeVisible({ timeout: 30_000 });
    // 不应是拒答:不出现「未在文档中找到依据」印章。
    await expect(page.getByText("未在文档中找到依据")).toHaveCount(0);

    // 点击引用 → 展开原文 blockquote(可核对)。
    await citation.click();
    await expect(citation).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("blockquote")).toBeVisible();
  });
});
