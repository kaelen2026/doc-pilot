"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PdfReader } from "@/features/pdf/pdf-reader";
import { apiFetch, requireOk } from "@/lib/api-client";

export function PublicPdfView({ documentId }: { documentId: string }) {
  const document = useQuery({
    queryKey: ["public-document", documentId],
    queryFn: async () =>
      (
        (await (await requireOk(await apiFetch(`/public/documents/${documentId}`))).json()) as {
          document: { title: string; ownerUsername: string; ownerName: string };
        }
      ).document,
  });
  const file = useQuery({
    queryKey: ["public-document-file", documentId],
    queryFn: async () =>
      (
        (await (
          await requireOk(await apiFetch(`/public/documents/${documentId}/file-url`))
        ).json()) as { url: string }
      ).url,
  });
  if (document.isPending || file.isPending)
    return <main className="p-8 text-ink-faint">加载公开文档…</main>;
  if (document.isError || file.isError || !document.data || !file.data)
    return <main className="p-8 text-seal">公开文档不存在或已取消公开</main>;
  return (
    <main className="mx-auto flex h-screen max-w-4xl flex-col px-6 py-6">
      <header className="flex items-center justify-between gap-4 pb-3">
        <div>
          <h1 className="truncate text-sm text-ink">{document.data.title}</h1>
          <Link href={`/u/${document.data.ownerUsername}`} className="text-xs text-seal">
            {document.data.ownerName}
          </Link>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={file.data} target="_blank" rel="noopener noreferrer">
            打开 PDF
          </a>
        </Button>
      </header>
      <PdfReader url={file.data} documentId={documentId} />
    </main>
  );
}
