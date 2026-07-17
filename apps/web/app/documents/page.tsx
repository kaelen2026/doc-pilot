import type { Metadata } from "next";
import { DocumentsView } from "./documents-view";

export const metadata: Metadata = { title: "我的文档" };

export default function DocumentsPage() {
  return <DocumentsView />;
}
