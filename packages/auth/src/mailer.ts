import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST ?? "localhost";
const port = Number(process.env.SMTP_PORT ?? 1025);
const from = process.env.MAIL_FROM ?? "DocPilot <no-reply@docpilot.local>";

// createTransport 是惰性的，不会在构造时建连——import 本模块安全。
// 本地 Mailpit 无需鉴权 / TLS。
const transport = nodemailer.createTransport({ host, port, secure: false });

export async function sendOtpEmail(email: string, otp: string, type: string): Promise<void> {
  const subject = type === "sign-in" ? "DocPilot 登录验证码" : "DocPilot 验证码";
  await transport.sendMail({
    from,
    to: email,
    subject,
    text: `你的验证码是：${otp}\n\n10 分钟内有效。若非本人操作请忽略。`,
  });
}
