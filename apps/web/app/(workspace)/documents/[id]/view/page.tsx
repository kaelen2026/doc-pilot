import type { Metadata } from "next";
import { PdfView } from "./pdf-view";

export const metadata: Metadata = { title: "阅读原文" };

export default async function ViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  // 全局搜索命中片段深链 `?page=N` 打开即定位;非法/缺省则不定位。
  const { page } = await searchParams;
  const parsed = page ? Number(page) : Number.NaN;
  const initialPage = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  return <PdfView documentId={id} initialPage={initialPage} />;
}
