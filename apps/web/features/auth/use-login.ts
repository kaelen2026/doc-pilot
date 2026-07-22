"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/** 登录方式:验证码(OTP)/ 邮箱密码。Google 是并列的第三入口,不占 mode。 */
export type LoginMode = "otp" | "password";
/** OTP 两步:先要邮箱、再要验证码。 */
type OtpStep = "email" | "code";
/** 密码方式的两种动作:登录已有账号 / 注册新账号。 */
export type PasswordAction = "sign-in" | "sign-up";

const OTP_HINT =
  "验证码已发送。本地可在 Mailpit（http://localhost:8025）查看，或看 API 控制台日志。";

/**
 * 登录页控制器:持有三种入口(OTP / 密码 / Google)的状态与动作,对外只暴露
 * 状态值 + 动词化操作。展示层(login-form)只读状态、发回调,不碰 better-auth。
 * 三者并存:成功后统一 push 到 /documents(better-auth 已在 signIn 后建立会话)。
 */
export function useLogin() {
  const router = useRouter();

  const [mode, setMode] = useState<LoginMode>("otp");
  const [otpStep, setOtpStep] = useState<OtpStep>("email");
  const [passwordAction, setPasswordAction] = useState<PasswordAction>("sign-in");

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");

  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  function fail(text: string) {
    setBusy(false);
    setFailed(true);
    setMessage(text);
  }

  function goWorkspace() {
    // 登录/注册成功后进入工作台;会话已由 better-auth 更新,/documents 的 useSession 即登录态。
    router.push("/documents");
  }

  async function sendCode() {
    setBusy(true);
    setFailed(false);
    setMessage("发送中…");
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
    if (error) {
      fail(`发送失败：${error.message ?? "未知错误"}`);
      return;
    }
    setBusy(false);
    setOtpStep("code");
    setMessage(OTP_HINT);
  }

  async function verifyCode() {
    setBusy(true);
    setFailed(false);
    setMessage("验证中…");
    const { error } = await authClient.signIn.emailOtp({ email, otp });
    if (error) {
      fail(`登录失败：${error.message ?? "未知错误"}`);
      return;
    }
    goWorkspace();
  }

  async function submitPassword() {
    setBusy(true);
    setFailed(false);
    setMessage(passwordAction === "sign-in" ? "登录中…" : "注册中…");
    const { error } =
      passwordAction === "sign-in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: "" });
    if (error) {
      fail(`${passwordAction === "sign-in" ? "登录" : "注册"}失败：${error.message ?? "未知错误"}`);
      return;
    }
    goWorkspace();
  }

  async function signInWithGoogle() {
    setBusy(true);
    setFailed(false);
    setMessage("正在跳转 Google…");
    // 成功后 better-auth 会带着会话重定向回 callbackURL;失败(未跳转)才回到这里报错。
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/documents",
    });
    if (error) {
      fail(`Google 登录失败：${error.message ?? "未知错误"}`);
    }
  }

  /** 在验证码 / 密码之间切换,顺带清掉上一种方式的临时输入与提示。 */
  function switchMode(next: LoginMode) {
    setMode(next);
    setMessage(null);
    setFailed(false);
    setOtp("");
    setPassword("");
    setOtpStep("email");
  }

  function togglePasswordAction() {
    setPasswordAction((prev) => (prev === "sign-in" ? "sign-up" : "sign-in"));
    setMessage(null);
    setFailed(false);
  }

  return {
    mode,
    otpStep,
    passwordAction,
    email,
    otp,
    password,
    message,
    failed,
    busy,
    setEmail,
    setOtp,
    setPassword,
    sendCode,
    verifyCode,
    submitPassword,
    signInWithGoogle,
    switchMode,
    togglePasswordAction,
  };
}
