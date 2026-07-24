"use client";

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import type { Highlight } from "./use-pdf-highlights";

/**
 * 单页:近视口时渲染到 canvas,远离时卸载 canvas 以控内存(225 页也稳)。
 * 未渲染时用占位高度(按宽高比)撑住,避免滚动跳动。
 */
export function PdfPage({
  pdf,
  pageNumber,
  width,
  fallbackAspect,
  root,
  highlights,
  onRemoveHighlight,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  fallbackAspect: number;
  root: HTMLElement | null;
  highlights: Highlight[];
  onRemoveHighlight: (id: string) => void;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const canvasHolderRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [aspect, setAspect] = useState(fallbackAspect);

  const pageHighlights = highlights.filter((h) => h.page === pageNumber);

  // 近视口探测:提前 1.5 屏预渲染。
  useEffect(() => {
    const el = slotRef.current;
    if (!el) {
      return;
    }
    const io = new IntersectionObserver((entries) => setNear(entries[0]?.isIntersecting ?? false), {
      root,
      rootMargin: "150% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [root]);

  // 渲染 canvas + 文本层(可选中),卸载时清空。width 变化(缩放)时重渲。
  useEffect(() => {
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    let cancelled = false;

    if (!near) {
      canvasHolderRef.current?.replaceChildren();
      textLayerRef.current?.replaceChildren();
      return;
    }

    (async () => {
      const pdfjs = await import("pdfjs-dist");
      const page: PDFPageProxy = await pdf.getPage(pageNumber);
      if (cancelled) {
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const unscaled = page.getViewport({ scale: 1 });
      const asp = unscaled.height / unscaled.width;
      const cssHeight = Math.round(width * asp);
      setAspect(asp);
      const cssScale = width / unscaled.width;

      // Canvas:按 dpr 超采样求清晰,CSS 尺寸维持页面显示大小。
      const viewport = page.getViewport({ scale: cssScale * dpr });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${cssHeight}px`;
      canvas.className = "block";
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      canvasHolderRef.current?.replaceChildren(canvas);
      renderTask = page.render({ canvas, canvasContext: ctx, viewport });
      try {
        await renderTask.promise;
      } catch {
        // 缩放/滚动打断的渲染会抛 RenderingCancelledException,忽略。
      }

      // 文本层:透明可选中文字,坐标用 CSS scale(非 dpr),容器设 --total-scale-factor。
      const tld = textLayerRef.current;
      if (cancelled || !tld) {
        return;
      }
      tld.replaceChildren();
      tld.style.setProperty("--total-scale-factor", String(cssScale));
      tld.style.width = `${width}px`;
      tld.style.height = `${cssHeight}px`;
      try {
        const textLayer = new pdfjs.TextLayer({
          textContentSource: page.streamTextContent(),
          container: tld,
          viewport: page.getViewport({ scale: cssScale }),
        });
        await textLayer.render();
      } catch {
        // 无文本层(扫描件)或被打断:忽略,页面仍可看。
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [near, width, pdf, pageNumber]);

  return (
    <div
      ref={slotRef}
      data-page={pageNumber}
      className="relative bg-paper-raised shadow-paper-sm"
      style={{ width, height: near ? undefined : Math.round(width * aspect) }}
    >
      <div ref={canvasHolderRef} />
      <div ref={textLayerRef} className="textLayer" />
      {pageHighlights.flatMap((h) =>
        h.rects.map((r) => (
          <button
            type="button"
            key={`${h.id}-${r.x}-${r.y}`}
            onClick={() => onRemoveHighlight(h.id)}
            title="点击移除高亮"
            aria-label="移除高亮"
            className="absolute z-[2] cursor-pointer rounded-[1px]"
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.w * 100}%`,
              height: `${r.h * 100}%`,
              backgroundColor: "color-mix(in oklch, var(--color-seal) 30%, transparent)",
            }}
          />
        )),
      )}
    </div>
  );
}
