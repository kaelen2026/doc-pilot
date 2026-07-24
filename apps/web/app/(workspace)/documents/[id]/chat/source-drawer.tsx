"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { SourceReader } from "@/features/pdf/source-reader";

/**
 * 原文抽屉:右侧滑入的浮层,复用 PDF 阅读器并定位到 page。桌面覆盖右半屏、
 * 移动端全屏;聊天保持在左侧不重排。Esc 或点关闭收起。portal 到 body。
 */
export function SourceDrawer({
  documentId,
  page,
  onClose,
}: {
  documentId: string;
  page: number;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <aside
      aria-label="原文"
      className="fixed inset-y-0 right-0 z-40 flex h-screen w-full flex-col border-hairline border-l bg-paper shadow-paper-drawer animate-[slideInRight_0.28s_cubic-bezier(0.2,0,0,1)_both] sm:w-[min(560px,80vw)] lg:w-[46vw]"
    >
      <header className="flex items-center justify-between gap-3 border-hairline border-b px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-ink text-sm">原文</span>
          <span className="text-ink-faint text-xs tabular-nums">第 {page} 页</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭原文"
          className="rounded-sm px-1.5 py-0.5 text-ink-faint text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [@media(hover:hover)]:hover:text-ink"
        >
          ✕
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <SourceReader documentId={documentId} page={page} />
      </div>
    </aside>,
    document.body,
  );
}
