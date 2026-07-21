import type { Metadata } from "next";
import { ChatView } from "./chat-view";

export const metadata: Metadata = { title: "文档问答" };

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatView documentId={id} />;
}
