"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SealMark } from "@/components/seal-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "../../lib/auth-client";

type Step = "email" | "otp";

export function LoginForm() {
  const router = useRouter();
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
    // 登录成功后进入工作台;better-auth 已在 signIn 后更新会话,/documents 的 useSession 直接是登录态。
    router.push("/documents");
  }

  const failed = message?.includes("失败");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-7 px-6">
      <header className="space-y-4">
        <SealMark className="size-9 text-lg" />
        <h1 className="font-display text-3xl font-medium">登录 DocPilot</h1>
      </header>

      <div className="flex flex-col gap-3">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={step === "otp"}
        />

        {step === "otp" && (
          <Input
            type="text"
            inputMode="numeric"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="邮箱验证码"
            className="tabular-nums"
          />
        )}

        <Button
          onClick={step === "email" ? sendCode : verify}
          disabled={busy || (step === "email" ? !email : !otp)}
        >
          {step === "email" ? "发送验证码" : "登录"}
        </Button>
      </div>

      {message && (
        <p className={`text-sm leading-[1.7] ${failed ? "text-seal" : "text-ink-soft"}`}>
          {message}
        </p>
      )}

      <Button asChild variant="link" size="sm" className="w-fit self-start px-0">
        <Link href="/">返回首页</Link>
      </Button>
    </main>
  );
}
