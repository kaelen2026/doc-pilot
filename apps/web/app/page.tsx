"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SealMark } from "@/components/seal-mark";
import { Button } from "@/components/ui/button";
import { authClient } from "../lib/auth-client";

const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

// 产品的真实流水线,作为编号序列呈现(不是三张同款卡片)。
const STEPS = [
  {
    n: "01",
    title: "上传",
    body: "拖入 PDF 即可,单文件最大 50MB、500 页。上传完成便能在线翻阅原文。",
  },
  {
    n: "02",
    title: "解析",
    body: "自动解析、清洗、切片、向量化,并生成整篇摘要,全程可见处理进度。",
  },
  {
    n: "03",
    title: "问答",
    body: "基于全文检索作答,每条回答都附原文页码引用,点开即定位到该页核对。",
  },
];

export default function HomePage() {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();

  // 已登录直接进工作台:landing 只面向未登录访客。
  useEffect(() => {
    if (!isPending && session) {
      router.replace("/documents");
    }
  }, [isPending, session, router]);

  // 会话解析中 / 即将跳转:安静占位,避免向已登录用户闪现 landing。
  if (isPending || session) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-ink-faint">加载中…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6">
      <nav className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2.5">
          <SealMark className="size-8 text-base" />
          <span className="font-display text-lg font-medium tracking-[-0.01em]">DocPilot</span>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/login">登录</Link>
        </Button>
      </nav>

      <section className="flex flex-1 flex-col justify-center gap-9 py-16">
        <div className={`space-y-6 ${rise}`}>
          <p className="text-sm font-medium tracking-wide text-seal">AI 文档工作台</p>
          <h1 className="font-display text-5xl font-medium leading-[1.1] tracking-[-0.022em] text-balance sm:text-6xl">
            把每一份 PDF
            <br />
            读成能对话的档案
          </h1>
          <p className="max-w-[34rem] text-lg leading-[1.75] text-ink-soft text-pretty">
            上传 PDF,DocPilot
            自动解析、切片、向量化并生成摘要,再基于全文回答你的提问。每条答案都带页码引用,可回到原文逐句核对。
          </p>
        </div>

        <div className={rise} style={{ animationDelay: "100ms" }}>
          <Button asChild size="lg">
            <Link href="/login">邮箱验证码登录,开始使用</Link>
          </Button>
        </div>
      </section>

      <section
        className={`border-t border-hairline py-14 ${rise}`}
        style={{ animationDelay: "200ms" }}
      >
        <ol className="grid gap-px overflow-hidden rounded-lg bg-hairline sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex flex-col gap-3 bg-paper p-6">
              <span className="font-display text-sm tabular-nums text-seal">{s.n}</span>
              <span className="font-display text-xl font-medium text-ink">{s.title}</span>
              <span className="text-sm leading-[1.7] text-ink-soft">{s.body}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
