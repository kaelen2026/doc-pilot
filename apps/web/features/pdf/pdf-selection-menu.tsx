"use client";

import { Button } from "@/components/ui/button";
import type { SelectionAnchor } from "./use-pdf-selection";

/**
 * 选中浮动工具栏(复制 / 高亮),固定定位在选区上方中点。
 * anchor 为空由调用方决定不渲染;此处只负责呈现。
 */
export function PdfSelectionMenu({
  anchor,
  copied,
  onCopy,
  onHighlight,
}: {
  anchor: SelectionAnchor;
  copied: boolean;
  onCopy: () => void;
  onHighlight: () => void;
}) {
  return (
    <div
      className="-translate-x-1/2 -translate-y-full fixed z-20 flex items-center gap-1 rounded-md border border-hairline bg-paper-raised px-1 py-1 shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
      style={{ left: anchor.x, top: anchor.y - 8 }}
    >
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={onCopy}>
        {copied ? "已复制" : "复制"}
      </Button>
      <span className="h-4 w-px bg-hairline" />
      <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={onHighlight}>
        高亮
      </Button>
    </div>
  );
}
