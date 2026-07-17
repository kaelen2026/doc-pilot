"use client";

import { useState } from "react";
import { authClient } from "../../lib/auth-client";

type Step = "email" | "otp";

const inputClass =
  "rounded-md border border-hairline bg-paper-raised px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-[border-color,box-shadow] duration-150 focus:border-seal focus:ring-2 focus:ring-seal/15 disabled:bg-paper-sunken disabled:text-ink-faint disabled:shadow-none";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<Step>("email");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true);
    setMessage("发送中…");
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    setBusy(false);
    if (error) {
      setMessage(`发送失败：${error.message ?? "未知错误"}`);
      return;
    }
    setStep("otp");
    setMessage(
      "验证码已发送。本地可在 Mailpit（http://localhost:8025）查看，或看 API 控制台日志。",
    );
  }

  async function verify() {
    setBusy(true);
    setMessage("验证中…");
    const { error } = await authClient.signIn.emailOtp({ email, otp });
    setBusy(false);
    if (error) {
      setMessage(`登录失败：${error.message ?? "未知错误"}`);
      return;
    }
    window.location.href = "/";
  }

  const failed = message?.includes("失败");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-7 px-6">
      <header className="space-y-4">
        <span
          aria-hidden
          className="flex size-9 items-center justify-center rounded-sm bg-seal pt-0.5 font-display text-lg leading-none text-paper-raised shadow-[0_1px_3px_rgba(0,0,0,0.18)]"
        >
          档
        </span>
        <h1 className="font-display text-3xl font-medium">登录 DocPilot</h1>
      </header>

      <div className="flex flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={step === "otp"}
          className={inputClass}
        />

        {step === "otp" && (
          <input
            type="text"
            inputMode="numeric"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="邮箱验证码"
            className={`tabular-nums ${inputClass}`}
          />
        )}

        <button
          type="button"
          onClick={step === "email" ? sendCode : verify}
          disabled={busy || (step === "email" ? !email : !otp)}
          className="rounded-md bg-ink px-3.5 py-2.5 text-sm font-medium text-paper-raised shadow-[0_1px_3px_rgba(0,0,0,0.16)] transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:bg-paper-sunken disabled:text-ink-faint disabled:shadow-none [@media(hover:hover)]:hover:enabled:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal"
        >
          {step === "email" ? "发送验证码" : "登录"}
        </button>
      </div>

      {message && (
        <p className={`text-sm leading-[1.7] ${failed ? "text-seal" : "text-ink-soft"}`}>
          {message}
        </p>
      )}

      <a
        href="/"
        className="w-fit text-sm text-ink-faint transition-colors duration-150 [@media(hover:hover)]:hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal"
      >
        返回首页
      </a>
    </main>
  );
}
