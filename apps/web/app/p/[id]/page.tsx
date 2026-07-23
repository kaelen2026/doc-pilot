import { PublicPdfView } from "./public-pdf-view";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicPdfView documentId={id} />;
}
