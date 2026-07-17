"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useDocuments } from "@/features/documents/use-documents";
import { authClient } from "../../lib/auth-client";

const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

const STATUS_LABEL: Record<string, string> = {
  pending_upload: "待上传",
  uploaded: "已上传",
  queued: "排队中",
  processing: "处理中",
  ready: "就绪",
  partially_ready: "部分就绪",
  failed: "失败",
  deleting: "删除中",
  deleted: "已删除",
};

const STAGE_LABEL: Record<string, string> = {
  validate: "校验",
  parse: "解析",
  clean: "清洗",
  chunk: "切片",
  embed: "向量化",
  summarize: "摘要",
  finalize: "收尾",
};

export default function DocumentsPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const docsQuery = useDocuments(!!session);
  const docs = docsQuery.data;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <header className={`space-y-2 ${rise}`}>
        <h1 className="font-display text-3xl font-medium tracking-[-0.018em]">我的文档</h1>
        <p className="text-sm text-ink-faint">Phase 4 · 解析流水线</p>
      </header>

      <section className={rise} style={{ animationDelay: "100ms" }}>
        {sessionPending ? (
          <p className="text-sm text-ink-faint">加载会话…</p>
        ) : !session ? (
          <Button asChild>
            <Link href="/login">请先登录</Link>
          </Button>
        ) : docsQuery.isError ? (
          <p className="text-sm text-seal">{String(docsQuery.error)}</p>
        ) : docs === undefined ? (
          <p className="text-sm text-ink-faint">加载文档…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm leading-[1.7] text-ink-soft">
            还没有文档。上传功能将在后续阶段接入。
          </p>
        ) : (
          <Card className="gap-0 overflow-hidden py-0">
            <ul className="divide-y divide-hairline">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-col gap-1.5 px-4 py-3.5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="truncate text-sm text-ink">{d.title}</span>
                    <Badge className="shrink-0">{STATUS_LABEL[d.status] ?? d.status}</Badge>
                  </div>
                  {d.status === "processing" ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink-faint tabular-nums">
                        {STAGE_LABEL[d.currentStage ?? ""] ?? d.currentStage ?? "处理中"} ·{" "}
                        {d.progress}%
                      </span>
                      <Progress value={d.progress} className="flex-1" />
                    </div>
                  ) : d.status === "ready" && d.pageCount ? (
                    <span className="text-xs text-ink-faint tabular-nums">{d.pageCount} 页</span>
                  ) : d.status === "failed" ? (
                    <Badge variant="destructive" className="text-xs">
                      处理失败
                    </Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <Button asChild variant="link" size="sm" className="w-fit self-start px-0">
        <Link href="/">返回首页</Link>
      </Button>
    </main>
  );
}
