"use client";

import { useCallback, useEffect, useState } from "react";

/** 归一化矩形(相对页面 0–1),缩放时按当前页尺寸还原,故与 zoom 无关。 */
export type NormRect = { x: number; y: number; w: number; h: number };
/** 用户高亮:落在某页的一组矩形 + 选中文本。存 localStorage。 */
export type Highlight = { id: string; page: number; rects: NormRect[]; text: string };

const hlKey = (documentId: string) => `docpilot:hl:${documentId}`;

function save(documentId: string, next: Highlight[]) {
  try {
    localStorage.setItem(hlKey(documentId), JSON.stringify(next));
  } catch {
    // 隐私模式/超额:忽略,至少本会话内可用。
  }
}

/**
 * 用户高亮的持久化状态(按文档隔离,存 localStorage):进入时载入,增删即落库。
 * 几何计算(选区 rects → 归一化)留在阅读器,这里只管状态与存储。
 */
export function usePdfHighlights(documentId: string) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(hlKey(documentId));
      setHighlights(raw ? (JSON.parse(raw) as Highlight[]) : []);
    } catch {
      setHighlights([]);
    }
  }, [documentId]);

  const add = useCallback(
    (additions: Highlight[]) => {
      setHighlights((cur) => {
        const next = [...cur, ...additions];
        save(documentId, next);
        return next;
      });
    },
    [documentId],
  );

  const remove = useCallback(
    (id: string) => {
      setHighlights((cur) => {
        const next = cur.filter((h) => h.id !== id);
        save(documentId, next);
        return next;
      });
    },
    [documentId],
  );

  return { highlights, add, remove };
}
