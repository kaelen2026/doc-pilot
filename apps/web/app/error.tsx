"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// App Router 的错误边界必须是客户端组件；兜住渲染期抛出的异常，避免整页白屏。
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 先落控制台；接入可观测层后改为上报。
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 px-6">
      <h1 className="font-display text-2xl font-medium">出错了</h1>
      <p className="text-sm leading-[1.7] text-ink-soft">
        页面渲染时发生异常{error.digest ? `（${error.digest}）` : ""}。可以重试，或稍后再来。
      </p>
      <Button onClick={reset} className="w-fit">
        重试
      </Button>
    </main>
  );
}
