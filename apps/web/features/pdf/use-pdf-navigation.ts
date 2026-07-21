"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { type RefObject, useCallback, useEffect, useState } from "react";
import { pageAtLine } from "./geometry";
import type { OutlineNode } from "./pdf-outline";

/** 页码导航状态与操作:当前页跟随、页码跳转、目录跳转。 */
export interface PdfNavigation {
  /** 顶部阅读线所在的页。 */
  current: number;
  /** 页码输入框的受控值(允许中间态,提交时才夹取)。 */
  pageInput: string;
  setPageInput: (value: string) => void;
  /** 跳到指定页(默认平滑)。 */
  jumpTo: (page: number, behavior?: ScrollBehavior) => void;
  /** 目录项 → 页码跳转。 */
  gotoDest: (dest: OutlineNode["dest"]) => Promise<void>;
  /** 滚动时重算当前页(下一帧)。 */
  handleScroll: () => void;
  /** 提交页码输入框:夹到 [1, numPages] 后跳转。 */
  submitPage: (e: React.FormEvent) => void;
}

/**
 * 页面导航:随滚动更新当前页、页码框跳转、目录跳转、带 initialPage 打开即定位。
 * 依赖滚动区里以 [data-page] 标记的分页 slot(由 PdfPage 渲染)。
 */
export function usePdfNavigation({
  scrollRef,
  pdf,
  numPages,
  initialPage,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  pdf: PDFDocumentProxy | null;
  numPages: number;
  initialPage?: number;
}): PdfNavigation {
  const [current, setCurrent] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  // 当前页:滚动区顶部阅读线所在的页(精确,不受懒加载 margin 影响)。
  const recomputeCurrent = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const line = el.getBoundingClientRect().top + 8;
    const slots = Array.from(el.querySelectorAll<HTMLElement>("[data-page]")).map((s) => ({
      page: Number(s.dataset.page),
      top: s.getBoundingClientRect().top,
    }));
    const cur = pageAtLine(line, slots);
    setCurrent(cur);
    setPageInput(String(cur));
  }, [scrollRef]);

  const handleScroll = useCallback(() => {
    requestAnimationFrame(recomputeCurrent);
  }, [recomputeCurrent]);

  const jumpTo = useCallback(
    (page: number, behavior: ScrollBehavior = "smooth") => {
      const el = scrollRef.current;
      if (!el) {
        return;
      }
      const slot = el.querySelector<HTMLElement>(`[data-page="${page}"]`);
      slot?.scrollIntoView({ block: "start", behavior });
    },
    [scrollRef],
  );

  // 带目标页打开(引用「查看原文」):文档就绪后跳到该页;initialPage 变化即重跳。
  // 用 rAF 等分页 slot 挂载;首跳用 auto(瞬时),避免从首页平滑长滚。
  useEffect(() => {
    if (!pdf || !initialPage) {
      return;
    }
    const id = requestAnimationFrame(() => jumpTo(initialPage, "auto"));
    return () => cancelAnimationFrame(id);
  }, [pdf, initialPage, jumpTo]);

  // 目录项 → 页码:dest 可能是命名目标(字符串)或显式数组,首元素是页面引用。
  const gotoDest = useCallback(
    async (dest: OutlineNode["dest"]) => {
      if (!pdf || !dest) {
        return;
      }
      const explicit = typeof dest === "string" ? await pdf.getDestination(dest) : dest;
      const ref = Array.isArray(explicit) ? explicit[0] : null;
      if (!ref) {
        return;
      }
      const index = await pdf.getPageIndex(ref as Parameters<typeof pdf.getPageIndex>[0]);
      jumpTo(index + 1);
    },
    [pdf, jumpTo],
  );

  const submitPage = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const n = Math.min(Math.max(1, Number(pageInput) || 1), numPages);
      setPageInput(String(n));
      jumpTo(n);
    },
    [pageInput, numPages, jumpTo],
  );

  return { current, pageInput, setPageInput, jumpTo, gotoDest, handleScroll, submitPage };
}
