"use client";

import { useFileUrl } from "@/features/documents/use-file-url";
import { authClient } from "@/lib/auth-client";
import { PdfReader } from "./pdf-reader";

/**
 * 抽屉内复用的原文阅读器:自身完成鉴权与取文件 URL,打开即定位到 page。
 * 返回填满 flex 父容器的阅读器(父需为限定高度的 flex 列)。跨路由共享,故置于
 * features 而非某个路由目录。
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
