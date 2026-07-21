"use client";

import Link from "next/link";
import { HeaderActions } from "@/components/header-actions";
import { Button } from "@/components/ui/button";
import { useFileUrl } from "@/features/documents/use-file-url";
import { PdfReader } from "@/features/pdf/pdf-reader";
import { authClient } from "@/lib/auth-client";

const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

/**
 * 在线阅读原始 PDF 的整页视图:鉴权 + 取文件 URL + 头部(返回/下载),
 * 阅读器本体在 @/features/pdf。
 */
export function PdfView({ documentId, initialPage }: { documentId: string; initialPage?: number }) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const fileQuery = useFileUrl(documentId, !!session);

  function renderBody() {
    if (sessionPending || (session && fileQuery.isPending)) {
      return <p className="p-6 text-sm text-ink-faint">加载中…</p>;
    }
    if (!session) {
      return (
        <div className="p-6">
          <Button asChild>
            <Link href="/login">请先登录</Link>
          </Button>
        </div>
      );
    }
    if (fileQuery.isError) {
      return <p className="p-6 text-sm text-seal">{String(fileQuery.error)}</p>;
    }
    if (fileQuery.data) {
      return <PdfReader url={fileQuery.data} documentId={documentId} initialPage={initialPage} />;
    }
    return null;
  }

  return (
    <main className="mx-auto flex h-screen max-w-4xl flex-col px-6 py-6">
      {/* relative z-30:头部含账户下拉,须压过下方带 rise(独立堆叠上下文)的区块。 */}
      <header className={`relative z-30 flex items-center justify-between gap-4 pb-3 ${rise}`}>
        <Button asChild variant="link" size="sm" className="px-0">
          <Link href={`/documents/${documentId}/chat`}>← 返回问答</Link>
        </Button>
        <div className="flex shrink-0 items-center gap-2">
          {fileQuery.data ? (
            <Button asChild variant="outline" size="sm">
              <a href={fileQuery.data} target="_blank" rel="noopener noreferrer">
                下载
              </a>
            </Button>
          ) : null}
          <HeaderActions />
        </div>
      </header>

      {renderBody()}
    </main>
  );
}
