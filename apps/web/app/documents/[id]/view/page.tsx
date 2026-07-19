import type { Metadata } from "next";
import { PdfView } from "./pdf-view";

export const metadata: Metadata = { title: "阅读原文" };

export default async function ViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PdfView documentId={id} />;
}
