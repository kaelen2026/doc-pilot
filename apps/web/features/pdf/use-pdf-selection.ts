"use client";

import { type RefObject, useCallback, useState } from "react";
import { rectsToNormalizedByPage } from "./geometry";
import type { Highlight } from "./use-pdf-highlights";

/** 选区浮动工具栏的锚点(选区上方中点的视口坐标)。 */
export type SelectionAnchor = { x: number; y: number };

/** 文本选区状态与操作:浮动工具栏定位、复制、落库高亮。 */
export interface PdfSelection {
  /** 有活动选区时的工具栏锚点,否则 null(收起)。 */
  anchor: SelectionAnchor | null;
  copied: boolean;
  /** mouseup:根据当前选区决定弹出/收起工具栏。 */
  onSelectionEnd: () => void;
  copySelection: () => Promise<void>;
  addHighlight: () => void;
  /** 收起工具栏(如滚动后定位失真)。 */
  dismiss: () => void;
}

/**
 * 文本选区交互:选中弹出浮动工具栏,支持复制与高亮落库。
 * 几何(选区 rects → 按页归一化)走 geometry,存储走传入的 addHighlights。
 */
export function usePdfSelection({
  scrollRef,
  addHighlights,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  addHighlights: (additions: Highlight[]) => void;
}): PdfSelection {
  const [anchor, setAnchor] = useState<SelectionAnchor | null>(null);
  const [copied, setCopied] = useState(false);

  const dismiss = useCallback(() => setAnchor(null), []);

  // 选中文字后弹出浮动工具栏(复制/高亮)。空选中则收起。
  const onSelectionEnd = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.toString().trim() === "") {
      setAnchor(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setAnchor(null);
      return;
    }
    setAnchor({ x: rect.left + rect.width / 2, y: rect.top });
    setCopied(false);
  }, []);

  const copySelection = useCallback(async () => {
    const text = window.getSelection()?.toString() ?? "";
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // 无剪贴板权限:静默失败。
    }
  }, []);

  // 高亮:把选区的 client rects 按所在页归一化后落库。跨页选择自然分派到各页。
  const addHighlight = useCallback(() => {
    const el = scrollRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.isCollapsed) {
      return;
    }
    const text = sel.toString();
    const range = sel.getRangeAt(0);
    const slots = Array.from(el.querySelectorAll<HTMLElement>("[data-page]")).map((slot) => ({
      page: Number(slot.dataset.page),
      box: slot.getBoundingClientRect(),
    }));
    const byPage = rectsToNormalizedByPage(Array.from(range.getClientRects()), slots);
    if (byPage.size === 0) {
      return;
    }
    const additions: Highlight[] = [];
    for (const [page, rects] of byPage) {
      additions.push({
        id: `${Date.now()}-${page}-${Math.round((rects[0]?.x ?? 0) * 1e4)}`,
        page,
        rects,
        text,
      });
    }
    addHighlights(additions);
    sel.removeAllRanges();
    setAnchor(null);
  }, [scrollRef, addHighlights]);

  return { anchor, copied, onSelectionEnd, copySelection, addHighlight, dismiss };
}
