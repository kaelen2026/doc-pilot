"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { failureReason } from "@/features/documents/failure-reason";
import { validateFile } from "@/features/documents/upload";
import { useDocuments } from "@/features/documents/use-documents";
import { useUploadDocument } from "@/features/documents/use-upload-document";
import { openCommandPalette } from "@/features/search/use-command-palette";
import { ThemeToggle } from "@/features/theme/theme-toggle";
import { authClient } from "../../lib/auth-client";

const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

const docLinkClass =
  "text-xs text-seal underline-offset-4 transition-colors duration-150 [@media(hover:hover)]:hover:text-seal-deep [@media(hover:hover)]:hover:underline";

// 原文件在上传完成后即存在,故这些状态都可在线阅读(含失败的扫描件——便于用户核对上传了什么)。
const READABLE = new Set([
  "uploaded",
  "queued",
  "processing",
  "ready",
  "partially_ready",
  "failed",
]);

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

export function DocumentsView() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const docsQuery = useDocuments(!!session);
  const docs = docsQuery.data;

  const router = useRouter();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const upload = useUploadDocument();

  async function signOut() {
    await authClient.signOut();
    queryClient.clear(); // 清掉缓存的文档数据,避免下个账号看到上个账号的列表
    router.replace("/");
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许再次选择同一文件
    if (!file) {
      return;
    }
    const err = validateFile(file);
    if (err) {
      setFileError(err);
      return;
    }
    setFileError(null);
    setNotice(null);
    upload.mutate(file, {
      onSuccess: (data) => {
        if (data.deduplicated) {
          setNotice("该文件内容已存在,已为你复用现有文档,跳过重复上传。");
        }
      },
    });
  }

  const uploadError = fileError ?? (upload.isError ? String(upload.error) : null);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <header className={`flex items-start justify-between gap-4 ${rise}`}>
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-medium tracking-[-0.018em]">我的文档</h1>
          <p className="text-sm text-ink-faint">就绪的文档可以直接问答,回答附原文引用</p>
        </div>
        {session ? (
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={openCommandPalette}>
              搜索 <kbd className="ml-1.5 text-ink-faint text-xs">⌘K</kbd>
            </Button>
            <Button variant="outline" size="sm" onClick={signOut}>
              退出登录
            </Button>
          </div>
        ) : null}
      </header>

      <section className={rise} style={{ animationDelay: "100ms" }}>
        {sessionPending ? (
          <p className="text-sm text-ink-faint">加载会话…</p>
        ) : !session ? (
          <Button asChild>
            <Link href="/login">请先登录</Link>
          </Button>
        ) : (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={onPickFile}
                />
                <Button onClick={() => fileInputRef.current?.click()} disabled={upload.isPending}>
                  {upload.isPending ? "上传中…" : "上传 PDF"}
                </Button>
                <span className="text-xs text-ink-faint">PDF · 最大 50MB</span>
              </div>
              {uploadError ? <p className="text-sm text-seal">{uploadError}</p> : null}
              {notice ? <p className="text-sm text-ink-soft">{notice}</p> : null}
            </div>

            {docsQuery.isError ? (
              <p className="text-sm text-seal">{String(docsQuery.error)}</p>
            ) : docs === undefined ? (
              <p className="text-sm text-ink-faint">加载文档…</p>
            ) : docs.length === 0 ? (
              <p className="text-sm leading-[1.7] text-ink-soft">还没有文档。上传一个 PDF 开始。</p>
            ) : (
              <Card className="gap-0 overflow-hidden py-0">
                <ul className="divide-y divide-hairline">
                  {docs.map((d) => (
                    <li key={d.id} className="flex flex-col gap-1.5 px-4 py-3.5">
                      <div className="flex items-center justify-between gap-4">
                        <span className="truncate text-sm text-ink">{d.title}</span>
                        <span className="flex shrink-0 items-center gap-2.5">
                          {READABLE.has(d.status) ? (
                            <Link href={`/documents/${d.id}/view`} className={docLinkClass}>
                              阅读
                            </Link>
                          ) : null}
                          {d.status === "ready" || d.status === "partially_ready" ? (
                            <Link href={`/documents/${d.id}/chat`} className={docLinkClass}>
                              问答
                            </Link>
                          ) : null}
                          <Badge>{STATUS_LABEL[d.status] ?? d.status}</Badge>
                        </span>
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
                        <span className="text-xs text-ink-faint tabular-nums">
                          {d.pageCount} 页
                        </span>
                      ) : d.status === "failed" ? (
                        <span className="text-xs leading-[1.6] text-seal">
                          {failureReason(d.errorCode)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
