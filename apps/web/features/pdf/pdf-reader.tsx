"use client";

import { useCallback, useRef, useState } from "react";
import { OutlineTree } from "./pdf-outline";
import { PdfPage } from "./pdf-page";
import { PdfSelectionMenu } from "./pdf-selection-menu";
import { PdfToolbar } from "./pdf-toolbar";
import { usePdfDocument } from "./use-pdf-document";
import { usePdfHighlights } from "./use-pdf-highlights";
import { usePdfNavigation } from "./use-pdf-navigation";
import { usePdfSelection } from "./use-pdf-selection";
import { usePdfViewport } from "./use-pdf-viewport";

const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

const GAP = 16; // 页间距,与滚动定位换算一致

/**
 * 自绘 PDF 阅读器(PDF.js):分页懒渲染、缩放(适宽/整页/手动)、页码跳转、目录、
 * 全屏、文本选区复制/高亮。逻辑拆到 use-pdf-* 控制器,此处只做装配与布局。
 * initialPage 用于引用「查看原文」打开即定位。
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
  const [showToc, setShowToc] = useState(false);

  const { pdf, numPages, baseAspect, outline, error } = usePdfDocument(url);
  const viewport = usePdfViewport({ rootRef, scrollRef, baseAspect });
  const nav = usePdfNavigation({ scrollRef, pdf, numPages, initialPage });
  const { highlights, add: addHighlights, remove: removeHighlight } = usePdfHighlights(documentId);
  const selection = usePdfSelection({ scrollRef, addHighlights });

  const onScroll = useCallback(() => {
    nav.handleScroll();
    selection.dismiss(); // 选区工具栏是固定定位,滚动后位置失真,收起。
  }, [nav.handleScroll, selection.dismiss]);

  if (error) {
    return <p className="p-6 text-sm text-seal">无法加载 PDF:{error}</p>;
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 根容器仅拦截右键默认菜单,非交互控件
    <div
      ref={rootRef}
      className={`flex min-h-0 flex-1 flex-col bg-paper ${rise}`}
      style={{ animationDelay: "80ms" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <PdfToolbar
        hasOutline={outline !== null}
        showToc={showToc}
        onToggleToc={() => setShowToc((v) => !v)}
        current={nav.current}
        numPages={numPages}
        pageInput={nav.pageInput}
        onPageInput={nav.setPageInput}
        onSubmitPage={nav.submitPage}
        onPrev={() => nav.jumpTo(nav.current - 1)}
        onNext={() => nav.jumpTo(nav.current + 1)}
        scale={viewport.scale}
        canZoomOut={viewport.canZoomOut}
        canZoomIn={viewport.canZoomIn}
        onZoomOut={viewport.zoomOut}
        onZoomIn={viewport.zoomIn}
        onResetWidth={viewport.resetWidth}
        onFitPage={viewport.fitPage}
        fullscreen={viewport.fullscreen}
        onToggleFullscreen={viewport.toggleFullscreen}
      />

      {/* 目录侧栏 + 页面滚动区 */}
      <div className="flex min-h-0 flex-1">
        {showToc && outline ? (
          <aside className="w-56 shrink-0 overflow-auto border-hairline border-r bg-paper py-2 text-sm">
            <OutlineTree nodes={outline} onPick={nav.gotoDest} />
          </aside>
        ) : null}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: 滚动容器捕获文本选区(mouseup),非交互控件 */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          onMouseUp={selection.onSelectionEnd}
          className="min-h-0 flex-1 overflow-auto bg-paper-sunken py-4"
          style={{ scrollBehavior: "smooth" }}
        >
          <div className="flex flex-col items-center" style={{ gap: GAP }}>
            {pdf && viewport.fitWidth > 0
              ? Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
                  <PdfPage
                    key={n}
                    pdf={pdf}
                    pageNumber={n}
                    width={viewport.pageWidth}
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

      {/* 选中浮动工具栏(复制 / 高亮) */}
      {selection.anchor ? (
        <PdfSelectionMenu
          anchor={selection.anchor}
          copied={selection.copied}
          onCopy={selection.copySelection}
          onHighlight={selection.addHighlight}
        />
      ) : null}
    </div>
  );
}
