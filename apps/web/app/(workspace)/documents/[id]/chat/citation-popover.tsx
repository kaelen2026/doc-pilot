"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CitationItem } from "@/features/chat/types";

/**
 * 引用 popover:portal 到 body,固定定位在锚点附近(下方优先,不够则翻到上方),
 * 随滚动/缩放重新定位;点击外部或 Esc 关闭。展示可核对的原文与支撑结论。
 */
export function CitationPopover({
  citation,
  anchor,
  onClose,
  onViewSource,
}: {
  citation: CitationItem;
  anchor: HTMLElement;
  onClose: () => void;
  onViewSource: (citation: CitationItem) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    function place() {
      const el = ref.current;
      if (!el) {
        return;
      }
      const a = anchor.getBoundingClientRect();
      const ph = el.offsetHeight;
      const pw = el.offsetWidth;
      const margin = 8;
      const below = window.innerHeight - a.bottom;
      const top =
        below < ph + margin && a.top > ph + margin ? a.top - ph - margin : a.bottom + margin;
      const left = Math.max(
        margin,
        Math.min(a.left + a.width / 2 - pw / 2, window.innerWidth - pw - margin),
      );
      setPos({ top, left });
    }
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [anchor]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.contains(t)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`引用原文${citation.pageStart != null ? `,第 ${citation.pageStart} 页` : ""}`}
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
      className="fixed z-50 w-[min(20rem,calc(100vw-1rem))] space-y-1.5 rounded-md border border-hairline bg-paper px-3.5 py-2.5 shadow-[0_8px_28px_-6px_rgba(0,0,0,0.22)]"
    >
      {citation.pageStart != null ? (
        <p className="text-xs text-seal tabular-nums">第 {citation.pageStart} 页</p>
      ) : null}
      <blockquote className="border-l-2 border-seal pl-2.5 text-sm leading-[1.7] text-ink-soft">
        “{citation.quote}”
      </blockquote>
      {citation.claim ? <p className="text-xs text-ink-faint">支撑:{citation.claim}</p> : null}
      {citation.pageStart != null ? (
        <div className="pt-0.5">
          <button
            type="button"
            onClick={() => {
              onViewSource(citation);
              onClose();
            }}
            className="inline-flex items-center gap-1 rounded-sm text-xs text-seal underline-offset-4 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [@media(hover:hover)]:hover:text-seal-deep [@media(hover:hover)]:hover:underline"
          >
            查看原文
            <svg
              aria-hidden="true"
              role="presentation"
              viewBox="0 0 16 16"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 4l4 4-4 4" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
