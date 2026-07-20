"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useFileUrl } from "@/features/documents/use-file-url";
import { authClient } from "@/lib/auth-client";
import { PdfReader } from "./pdf-reader";

const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

/**
 * 在线阅读原始 PDF 的整页视图:鉴权 + 取文件 URL + 头部(返回/下载),
 * 阅读器本体见 pdf-reader.tsx。
 */
export function PdfView({ documentId }: { documentId: string }) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const fileQuery = useFileUrl(documentId, !!session);

  return (
    <main className="mx-auto flex h-screen max-w-4xl flex-col px-6 py-6">
      <header className={`flex items-center justify-between gap-4 pb-3 ${rise}`}>
        <Button asChild variant="link" size="sm" className="px-0">
          <Link href={`/documents/${documentId}/chat`}>← 返回问答</Link>
        </Button>
        {fileQuery.data ? (
          <Button asChild variant="outline" size="sm">
            <a href={fileQuery.data} target="_blank" rel="noopener noreferrer">
              下载
            </a>
          </Button>
        ) : null}
      </header>

      {sessionPending || (session && fileQuery.isPending) ? (
        <p className="p-6 text-sm text-ink-faint">加载中…</p>
      ) : !session ? (
        <div className="p-6">
          <Button asChild>
            <Link href="/login">请先登录</Link>
          </Button>
        </div>
      ) : fileQuery.isError ? (
        <p className="p-6 text-sm text-seal">{String(fileQuery.error)}</p>
      ) : fileQuery.data ? (
        <PdfReader url={fileQuery.data} documentId={documentId} />
      ) : null}
    </main>
  );
}

/**
 * 抽屉内复用的原文阅读器:自身完成鉴权与取文件 URL,打开即定位到 page。
 * 返回填满 flex 父容器的阅读器(父需为限定高度的 flex 列)。
 */
export function SourceReader({ documentId, page }: { documentId: string; page: number }) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const fileQuery = useFileUrl(documentId, !!session);

  if (sessionPending || (session && fileQuery.isPending)) {
    return <p className="p-6 text-sm text-ink-faint">加载中…</p>;
  }
  if (!session) {
    return <p className="p-6 text-sm text-ink-soft">请先登录后查看原文。</p>;
  }
  if (fileQuery.isError) {
    return <p className="p-6 text-sm text-seal">无法加载 PDF:{String(fileQuery.error)}</p>;
  }
  if (!fileQuery.data) {
    return null;
  }
  return <PdfReader url={fileQuery.data} documentId={documentId} initialPage={page} />;
}
