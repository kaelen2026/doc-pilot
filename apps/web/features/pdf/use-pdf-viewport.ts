"use client";

import { type RefObject, useCallback, useEffect, useState } from "react";
import { fitPageScale } from "./geometry";

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const ZOOM_STEP = 0.2;

/** 缩放/尺寸/全屏的视图状态与操作。scale 是相对「适宽」的倍数。 */
export interface PdfViewport {
  /** 相对「适宽」的缩放倍数(1 即适宽)。 */
  scale: number;
  /** 适宽基准宽(减左右留白),供整页换算与占位。 */
  fitWidth: number;
  /** 当前渲染页宽(px)。 */
  pageWidth: number;
  fullscreen: boolean;
  canZoomOut: boolean;
  canZoomIn: boolean;
  zoomOut: () => void;
  zoomIn: () => void;
  /** 回到适宽(scale = 1)。 */
  resetWidth: () => void;
  /** 整页:让当前页在可视高度内完整可见。 */
  fitPage: () => void;
  toggleFullscreen: () => Promise<void>;
}

/**
 * 阅读器的视图控制:随滚动区尺寸变化重算 box、跟随浏览器全屏状态、管理缩放。
 * rootRef 是全屏目标(含工具条),scrollRef 是页面滚动区(尺寸来源)。
 */
export function usePdfViewport({
  rootRef,
  scrollRef,
  baseAspect,
}: {
  rootRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLElement | null>;
  baseAspect: number;
}): PdfViewport {
  const [box, setBox] = useState({ w: 0, h: 0 }); // 滚动区可视尺寸
  const [scale, setScale] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  // 滚动区尺寸(适宽/整页换算、全屏后重算都靠它)。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef]);

  // 全屏状态跟随浏览器(Esc 退出也能同步)。
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [rootRef]);

  const fitWidth = Math.max(240, box.w - 32);
  const pageWidth = Math.round(fitWidth * scale);

  const zoomOut = useCallback(
    () => setScale((s) => Math.max(MIN_SCALE, Math.round((s - ZOOM_STEP) * 10) / 10)),
    [],
  );
  const zoomIn = useCallback(
    () => setScale((s) => Math.min(MAX_SCALE, Math.round((s + ZOOM_STEP) * 10) / 10)),
    [],
  );
  const resetWidth = useCallback(() => setScale(1), []);
  const fitPage = useCallback(() => {
    // 整页:取宽/高约束的较小者,即「自适应当前页」。
    setScale(fitPageScale(box.h, fitWidth, baseAspect, MIN_SCALE));
  }, [box.h, fitWidth, baseAspect]);

  const toggleFullscreen = useCallback(async () => {
    // 清掉残留选区,避免全屏切换的重排把选区从工具条扩展到整篇文档文本层。
    window.getSelection()?.removeAllRanges();
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    } else {
      await rootRef.current?.requestFullscreen().catch(() => {});
    }
  }, [rootRef]);

  return {
    scale,
    fitWidth,
    pageWidth,
    fullscreen,
    canZoomOut: scale > MIN_SCALE,
    canZoomIn: scale < MAX_SCALE,
    zoomOut,
    zoomIn,
    resetWidth,
    fitPage,
    toggleFullscreen,
  };
}
