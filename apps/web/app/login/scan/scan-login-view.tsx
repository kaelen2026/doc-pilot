"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { SealMark } from "@/components/seal-mark";
import { Button } from "@/components/ui/button";
import { useScanLogin } from "@/features/scan-login/use-scan-login";

export function ScanLoginView() {
  const { status, qrValue, userCode, regenerate } = useScanLogin();

  // 多状态渲染用守卫式早返回收敛(见 frontend.md「状态与渲染」)。
  function renderBody() {
    if (status === "loading") {
      return <Placeholder>正在生成二维码…</Placeholder>;
    }
    if (status === "error") {
      return (
        <Retry onRetry={regenerate} tone="seal">
          取码失败,请重试。
        </Retry>
      );
    }
    if (status === "expired") {
      return <Retry onRetry={regenerate}>二维码已过期。刷新后用手机重新扫码。</Retry>;
    }
    if (status === "denied") {
      return <Retry onRetry={regenerate}>已在手机上取消登录。可刷新二维码重试。</Retry>;
    }
    if (status === "approved") {
      return <Placeholder>已在手机确认,正在进入…</Placeholder>;
    }
    // waiting:展示二维码。
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-lg bg-paper-raised p-4 text-ink shadow-sm">
          {qrValue && (
            <QRCodeSVG
              value={qrValue}
              size={200}
              // fgColor 用 currentColor 继承 text-ink,不写裸色值;bg 透明露出卡片纸色。
              fgColor="currentColor"
              bgColor="transparent"
              marginSize={2}
            />
          )}
        </div>
        {userCode && (
          <p className="text-sm text-ink-faint">
            扫不动?配对码{" "}
            <span className="font-mono tracking-widest text-ink-soft">{userCode}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-7 px-6">
      <header className="space-y-4">
        <SealMark className="size-9 text-lg" />
        <h1 className="font-display text-3xl font-medium">扫码登录</h1>
        <p className="text-sm leading-[1.7] text-ink-soft">
          用已登录的 DocPilot iOS App 扫描下方二维码,在手机上确认即可登录。
        </p>
      </header>

      {/* 动态状态区:告知读屏用户扫码进展。 */}
      <div aria-live="polite" className="min-h-[240px]">
        {renderBody()}
      </div>

      <Button asChild variant="link" size="sm" className="w-fit self-start px-0">
        <Link href="/login">用邮箱验证码登录</Link>
      </Button>
    </main>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[240px] items-center justify-center">
      <p className="text-sm text-ink-soft">{children}</p>
    </div>
  );
}

function Retry({
  children,
  onRetry,
  tone = "soft",
}: {
  children: React.ReactNode;
  onRetry: () => void;
  tone?: "soft" | "seal";
}) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center gap-4">
      <p className={`text-sm leading-[1.7] ${tone === "seal" ? "text-seal" : "text-ink-soft"}`}>
        {children}
      </p>
      <Button onClick={onRetry} variant="outline" size="sm">
        刷新二维码
      </Button>
    </div>
  );
}
