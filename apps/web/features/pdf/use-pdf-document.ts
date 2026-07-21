"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useState } from "react";
import type { OutlineNode } from "./pdf-outline";

/** 加载后的文档句柄与派生元信息;pdf 为 null 表示尚未就绪。 */
export interface PdfDocument {
  pdf: PDFDocumentProxy | null;
  numPages: number;
  /** 首页高/宽,默认≈A4,渲染后校正,用作未渲染页的占位比例。 */
  baseAspect: number;
  /** 内嵌书签目录:无书签时为 null(隐藏「目录」入口)。 */
  outline: OutlineNode[] | null;
  error: string | null;
}

/**
 * 载入 PDF 文档 + worker(模块 worker,经 bundler 解析资源 URL)并读取元信息。
 * url 变化时重新加载,卸载/切换时销毁旧文档。渲染与几何计算不在此处。
 */
export function usePdfDocument(url: string): PdfDocument {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [baseAspect, setBaseAspect] = useState(Math.SQRT2);
  const [outline, setOutline] = useState<OutlineNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(
          new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url),
          { type: "module" },
        );
        doc = await pdfjs.getDocument({ url }).promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        const first = await doc.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        setBaseAspect(vp.height / vp.width);
        setPdf(doc);
        setNumPages(doc.numPages);
        // 内嵌书签目录:有则展示「目录」入口,无则隐藏。
        const ol = (await doc.getOutline().catch(() => null)) as OutlineNode[] | null;
        if (!cancelled) {
          setOutline(ol && ol.length > 0 ? ol : null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
      void doc?.destroy();
    };
  }, [url]);

  return { pdf, numPages, baseAspect, outline, error };
}
