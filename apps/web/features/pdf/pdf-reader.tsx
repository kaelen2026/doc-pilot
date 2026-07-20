"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { type OutlineNode, OutlineTree } from "./pdf-outline";
import { PdfPage } from "./pdf-page";
import { type Highlight, type NormRect, usePdfHighlights } from "./use-pdf-highlights";

const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const GAP = 16; // 页间距,与滚动定位换算一致

/**
 * 自绘 PDF 阅读器(PDF.js):分页懒渲染、缩放(适宽/整页/手动)、页码跳转、目录、
 * 全屏、文本选区复制/高亮。initialPage 用于引用「查看原文」打开即定位。
 */
export function PdfReader({
  url,
  documentId,
  initialPage,
}: {
  url: string;
  documentId: string;
  /** 打开即定位到该页(引用「查看原文」);变化时重新跳转。 */
  initialPage?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null); // 全屏目标(含工具条)
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [baseAspect, setBaseAspect] = useState(Math.SQRT2); // 高/宽,默认≈A4,渲染后校正
  const [scale, setScale] = useState(1); // 相对「适宽」的倍数
  const [box, setBox] = useState({ w: 0, h: 0 }); // 滚动区可视尺寸
  const [current, setCurrent] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [fullscreen, setFullscreen] = useState(false);
  const [outline, setOutline] = useState<OutlineNode[] | null>(null);
  const [showToc, setShowToc] = useState(false);
  const { highlights, add: addHighlights, remove: removeHighlight } = usePdfHighlights(documentId);
  const [selTool, setSelTool] = useState<{ x: number; y: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载文档 + worker(模块 worker,经 bundler 解析资源 URL)。
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
  }, []);

  // 全屏状态跟随浏览器(Esc 退出也能同步)。
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const fitWidth = Math.max(240, box.w - 32); // 适宽基准(减左右留白)
  const pageWidth = Math.round(fitWidth * scale);

  // 当前页:滚动区顶部阅读线所在的页(精确,不受懒加载 margin 影响)。
  const recomputeCurrent = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const line = el.getBoundingClientRect().top + 8;
    const slots = el.querySelectorAll<HTMLElement>("[data-page]");
    let cur = 1;
    for (const s of slots) {
      if (s.getBoundingClientRect().top <= line) {
        cur = Number(s.dataset.page);
      } else {
        break;
      }
    }
    setCurrent(cur);
    setPageInput(String(cur));
  }, []);

  const onScroll = useCallback(() => {
    requestAnimationFrame(recomputeCurrent);
    setSelTool(null); // 选区工具栏是固定定位,滚动后位置失真,收起。
  }, [recomputeCurrent]);

  const jumpTo = useCallback((page: number, behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const slot = el.querySelector<HTMLElement>(`[data-page="${page}"]`);
    slot?.scrollIntoView({ block: "start", behavior });
  }, []);

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

  // 选中文字后弹出浮动工具栏(复制/高亮)。空选中则收起。
  const onSelectionEnd = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.toString().trim() === "") {
      setSelTool(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setSelTool(null);
      return;
    }
    setSelTool({ x: rect.left + rect.width / 2, y: rect.top });
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
    const slots = el.querySelectorAll<HTMLElement>("[data-page]");
    const byPage = new Map<number, NormRect[]>();
    for (const r of Array.from(range.getClientRects())) {
      if (r.width < 1 || r.height < 1) {
        continue;
      }
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      for (const slot of slots) {
        const b = slot.getBoundingClientRect();
        if (cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) {
          const page = Number(slot.dataset.page);
          const arr = byPage.get(page) ?? [];
          arr.push({
            x: (r.left - b.left) / b.width,
            y: (r.top - b.top) / b.height,
            w: r.width / b.width,
            h: r.height / b.height,
          });
          byPage.set(page, arr);
          break;
        }
      }
    }
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
    setSelTool(null);
  }, [addHighlights]);

  function submitPage(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.min(Math.max(1, Number(pageInput) || 1), numPages);
    setPageInput(String(n));
    jumpTo(n);
  }

  function fitPage() {
    // 整页:让当前页完整可见(取宽/高约束的较小者),即「自适应当前页」。
    const byWidth = 1;
    const byHeight = (box.h - 32) / (fitWidth * baseAspect);
    setScale(Math.max(MIN_SCALE, Math.min(byWidth, byHeight)));
  }

  async function toggleFullscreen() {
    // 清掉残留选区,避免全屏切换的重排把选区从工具条扩展到整篇文档文本层。
    window.getSelection()?.removeAllRanges();
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    } else {
      await rootRef.current?.requestFullscreen().catch(() => {});
    }
  }

  if (error) {
    return <p className="p-6 text-sm text-seal">无法加载 PDF:{error}</p>;
  }

  const toolBtn = "h-7 px-2 text-ink-soft";

  return (
    <div
      ref={rootRef}
      className={`flex min-h-0 flex-1 flex-col bg-paper ${rise}`}
      style={{ animationDelay: "80ms" }}
    >
      {/* 工具条:纯 UI chrome,禁止文本选中(按钮文字不该被选中) */}
      <div className="flex flex-wrap select-none items-center justify-center gap-x-4 gap-y-2 border-hairline border-y py-2">
        {outline ? (
          <>
            <Button
              type="button"
              variant={showToc ? "secondary" : "ghost"}
              size="sm"
              className={toolBtn}
              onClick={() => setShowToc((v) => !v)}
            >
              目录
            </Button>
            <span className="h-4 w-px bg-hairline" />
          </>
        ) : null}
        <form onSubmit={submitPage} className="flex items-center gap-1.5 text-xs text-ink-faint">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={toolBtn}
            aria-label="上一页"
            disabled={current <= 1}
            onClick={() => jumpTo(current - 1)}
          >
            ‹
          </Button>
          <input
            aria-label="页码"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
            onBlur={submitPage}
            className="w-10 rounded border border-hairline bg-paper-raised py-0.5 text-center text-ink tabular-nums outline-none focus:border-seal"
          />
          <span className="tabular-nums">/ {numPages || "…"}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={toolBtn}
            aria-label="下一页"
            disabled={current >= numPages}
            onClick={() => jumpTo(current + 1)}
          >
            ›
          </Button>
        </form>

        <span className="h-4 w-px bg-hairline" />

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={toolBtn}
            aria-label="缩小"
            disabled={scale <= MIN_SCALE}
            onClick={() => setScale((s) => Math.max(MIN_SCALE, Math.round((s - 0.2) * 10) / 10))}
          >
            −
          </Button>
          <span className="min-w-11 text-center text-xs text-ink-faint tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={toolBtn}
            aria-label="放大"
            disabled={scale >= MAX_SCALE}
            onClick={() => setScale((s) => Math.min(MAX_SCALE, Math.round((s + 0.2) * 10) / 10))}
          >
            +
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={toolBtn}
            onClick={() => setScale(1)}
          >
            适宽
          </Button>
          <Button type="button" variant="ghost" size="sm" className={toolBtn} onClick={fitPage}>
            整页
          </Button>
        </div>

        <span className="h-4 w-px bg-hairline" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={toolBtn}
          onClick={toggleFullscreen}
        >
          {fullscreen ? "退出全屏" : "全屏"}
        </Button>
      </div>

      {/* 目录侧栏 + 页面滚动区 */}
      <div className="flex min-h-0 flex-1">
        {showToc && outline ? (
          <aside className="w-56 shrink-0 overflow-auto border-hairline border-r bg-paper py-2 text-sm">
            <OutlineTree nodes={outline} onPick={gotoDest} />
          </aside>
        ) : null}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: 滚动容器捕获文本选区(mouseup),非交互控件 */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          onMouseUp={onSelectionEnd}
          className="min-h-0 flex-1 overflow-auto bg-paper-sunken py-4"
          style={{ scrollBehavior: "smooth" }}
        >
          <div className="flex flex-col items-center" style={{ gap: GAP }}>
            {pdf && fitWidth > 0
              ? Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
                  <PdfPage
                    key={n}
                    pdf={pdf}
                    pageNumber={n}
                    width={pageWidth}
                    fallbackAspect={baseAspect}
                    root={scrollRef.current}
                    highlights={highlights}
                    onRemoveHighlight={removeHighlight}
                  />
                ))
              : null}
          </div>
        </div>
      </div>

      {/* 选中浮动工具栏(复制 / 高亮)。固定定位在选区上方。 */}
      {selTool ? (
        <div
          className="-translate-x-1/2 -translate-y-full fixed z-20 flex items-center gap-1 rounded-md border border-hairline bg-paper-raised px-1 py-1 shadow-[0_2px_8px_rgba(0,0,0,0.18)]"
          style={{ left: selTool.x, top: selTool.y - 8 }}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={copySelection}
          >
            {copied ? "已复制" : "复制"}
          </Button>
          <span className="h-4 w-px bg-hairline" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={addHighlight}
          >
            高亮
          </Button>
        </div>
      ) : null}
    </div>
  );
}
