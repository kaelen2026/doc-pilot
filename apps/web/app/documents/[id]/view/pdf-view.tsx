"use client";

import Link from "next/link";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useFileUrl } from "@/features/documents/use-file-url";
import { authClient } from "@/lib/auth-client";

const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const GAP = 16; // 页间距,与滚动定位换算一致

/** PDF 内嵌书签目录节点(pdf.getOutline() 的子集)。 */
type OutlineNode = {
  title: string;
  dest: string | unknown[] | null;
  items: OutlineNode[];
};

/**
 * 在线阅读原始 PDF —— 自绘阅读器(PDF.js),UI 贴合墨水纸风格。
 * 分页懒渲染(近视口才渲、远离即卸载,225 页也稳),支持缩放(适宽/整页/手动)、
 * 页码跳转、全屏。引用跳转/高亮为后续 Slice。
 */
export function PdfView({ documentId }: { documentId: string }) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const fileQuery = useFileUrl(documentId, !!session);

  return (
    <main className="mx-auto flex h-screen max-w-4xl flex-col px-6 py-6">
      <header className={`flex items-center justify-between gap-4 pb-3 ${rise}`}>
        <Button asChild variant="link" size="sm" className="px-0">
          <Link href={`/documents/${documentId}/chat`}>← 返回问答</Link>
        </Button>
        {fileQuery.data ? (
          <Button asChild variant="outline" size="sm">
            <a href={fileQuery.data} target="_blank" rel="noopener noreferrer">
              下载
            </a>
          </Button>
        ) : null}
      </header>

      {sessionPending || (session && fileQuery.isPending) ? (
        <p className="p-6 text-sm text-ink-faint">加载中…</p>
      ) : !session ? (
        <div className="p-6">
          <Button asChild>
            <Link href="/login">请先登录</Link>
          </Button>
        </div>
      ) : fileQuery.isError ? (
        <p className="p-6 text-sm text-seal">{String(fileQuery.error)}</p>
      ) : fileQuery.data ? (
        <PdfReader url={fileQuery.data} />
      ) : null}
    </main>
  );
}

function PdfReader({ url }: { url: string }) {
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
  }, [recomputeCurrent]);

  const jumpTo = useCallback((page: number) => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const slot = el.querySelector<HTMLElement>(`[data-page="${page}"]`);
    slot?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

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
      {/* 工具条 */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-hairline border-y py-2">
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
        <div
          ref={scrollRef}
          onScroll={onScroll}
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
                  />
                ))
              : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 目录树:递归渲染书签,点击跳到对应 dest。 */
function OutlineTree({
  nodes,
  onPick,
  depth = 0,
}: {
  nodes: OutlineNode[];
  onPick: (dest: OutlineNode["dest"]) => void;
  depth?: number;
}) {
  return (
    <ul>
      {nodes.map((n) => (
        <li key={`${depth}:${n.title}`}>
          <button
            type="button"
            onClick={() => onPick(n.dest)}
            style={{ paddingLeft: depth * 12 + 12 }}
            className="block w-full truncate py-1 pr-3 text-left text-xs text-ink-soft transition-colors [@media(hover:hover)]:hover:bg-paper-sunken [@media(hover:hover)]:hover:text-ink"
            title={n.title}
          >
            {n.title}
          </button>
          {n.items?.length ? (
            <OutlineTree nodes={n.items} onPick={onPick} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * 单页:近视口时渲染到 canvas,远离时卸载 canvas 以控内存(225 页也稳)。
 * 未渲染时用占位高度(按宽高比)撑住,避免滚动跳动。
 */
function PdfPage({
  pdf,
  pageNumber,
  width,
  fallbackAspect,
  root,
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  fallbackAspect: number;
  root: HTMLElement | null;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [aspect, setAspect] = useState(fallbackAspect);

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

  // 渲染/卸载。width 变化(缩放)时,若在视口内重渲。
  useEffect(() => {
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    let cancelled = false;

    if (!near) {
      slotRef.current?.replaceChildren();
      return;
    }

    (async () => {
      const page: PDFPageProxy = await pdf.getPage(pageNumber);
      if (cancelled) {
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const unscaled = page.getViewport({ scale: 1 });
      const asp = unscaled.height / unscaled.width;
      setAspect(asp);
      const viewport = page.getViewport({ scale: (width / unscaled.width) * dpr });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${Math.round(width * asp)}px`;
      canvas.className = "block";
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      slotRef.current?.replaceChildren(canvas);
      renderTask = page.render({ canvas, canvasContext: ctx, viewport });
      try {
        await renderTask.promise;
      } catch {
        // 缩放/滚动打断的渲染会抛 RenderingCancelledException,忽略。
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
      className="bg-paper-raised shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
      style={{ width, height: near ? undefined : Math.round(width * aspect) }}
    />
  );
}
