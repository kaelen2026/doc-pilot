import { e2eEnv } from "./env";

const MAILPIT_URL = e2eEnv.mailpitUrl;

interface MailpitListMessage {
  ID: string;
}

/**
 * 从 Mailpit 取指定收件人最近一封邮件里的验证码(登录走真实 OTP 流程,
 * 本地/CI 用 Mailpit 兜住 SMTP,见 packages/auth/src/mailer.ts)。邮件正文形如
 * 「你的验证码是:123456」。邮件异步投递,故轮询到拿到为止。
 */
export async function fetchLatestOtp(email: string, timeoutMs = 20_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const search = new URL("/api/v1/search", MAILPIT_URL);
      search.searchParams.set("query", `to:${email}`);
      const listRes = await fetch(search);
      if (!listRes.ok) {
        lastError = `Mailpit 搜索 HTTP ${listRes.status}`;
      } else {
        const list = (await listRes.json()) as { messages?: MailpitListMessage[] };
        const message = list.messages?.[0];
        if (message) {
          const detailRes = await fetch(new URL(`/api/v1/message/${message.ID}`, MAILPIT_URL));
          if (detailRes.ok) {
            const body = (await detailRes.json()) as { Text?: string; HTML?: string };
            const text = body.Text ?? body.HTML ?? "";
            const code =
              text.match(/验证码是[：:]\s*(\d{4,8})/)?.[1] ?? text.match(/\b(\d{6})\b/)?.[1];
            if (code) {
              return code;
            }
            lastError = "邮件已到但未解析出验证码";
          }
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await sleep(500);
  }
  throw new Error(
    `未能在 ${timeoutMs}ms 内从 Mailpit 取到 ${email} 的验证码。最后错误:${lastError}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
