"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 跟随到底:窗口滚动到底部附近视为「贴底」,内容增高(流式、新消息)时自动滚到底;
 * 用户主动上滑离开底部即停止跟随,并暴露 atBottom 供「回到底部」按钮判定。
 */
export function useStickToBottom() {
  const sectionRef = useRef<HTMLElement>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    const THRESHOLD = 120;
    function compute() {
      const doc = document.documentElement;
      const near = window.innerHeight + window.scrollY >= doc.scrollHeight - THRESHOLD;
      atBottomRef.current = near;
      setAtBottom(near);
    }
    compute();
    window.addEventListener("scroll", compute, { passive: true });
    window.addEventListener("resize", compute);
    return () => {
      window.removeEventListener("scroll", compute);
      window.removeEventListener("resize", compute);
    };
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) {
      return;
    }
    // 内容区高度变化(打字机逐字、新消息)时,只有仍贴底才跟随,尊重用户上滑。
    const ro = new ResizeObserver(() => {
      if (atBottomRef.current) {
        window.scrollTo({ top: document.documentElement.scrollHeight });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scrollToBottom = useCallback(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: reduce ? "auto" : "smooth",
    });
  }, []);

  return { sectionRef, atBottom, scrollToBottom };
}
