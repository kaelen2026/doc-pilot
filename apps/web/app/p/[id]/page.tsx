import { PublicTopBar } from "@/features/shell/public-top-bar";
import { PublicPdfView } from "./public-pdf-view";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // PDF 阅读区靠父级定高撑开:外层占满视口、纵向 flex,顶栏取自然高度,
  // 阅读区 flex-1 吃掉剩余高度(view 的 <main> 已改成 min-h-0 flex-1)。
  return (
    <div className="flex h-dvh flex-col">
      <PublicTopBar />
      <PublicPdfView documentId={id} />
    </div>
  );
}
