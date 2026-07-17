"use client";

import { useState } from "react";
import { authClient } from "../../lib/auth-client";

type Step = "email" | "otp";

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

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">登录 DocPilot</h1>

      <div className="flex flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={step === "otp"}
          className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />

        {step === "otp" && (
          <input
            type="text"
            inputMode="numeric"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="邮箱验证码"
            className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        )}

        <button
          type="button"
          onClick={step === "email" ? sendCode : verify}
          disabled={busy || (step === "email" ? !email : !otp)}
          className="rounded-md bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50"
        >
          {step === "email" ? "发送验证码" : "登录"}
        </button>
      </div>

      {message && <p className="text-sm text-neutral-400">{message}</p>}
    </main>
  );
}
