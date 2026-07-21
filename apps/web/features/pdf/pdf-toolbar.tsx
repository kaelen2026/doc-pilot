"use client";

import { Button } from "@/components/ui/button";

const toolBtn = "h-7 px-2 text-ink-soft";

/**
 * 阅读器工具条(纯展示):目录开关、页码导航、缩放、全屏。
 * 状态与操作全部由 props 传入,自身不持有阅读器状态。
 */
export function PdfToolbar({
  hasOutline,
  showToc,
  onToggleToc,
  current,
  numPages,
  pageInput,
  onPageInput,
  onSubmitPage,
  onPrev,
  onNext,
  scale,
  canZoomOut,
  canZoomIn,
  onZoomOut,
  onZoomIn,
  onResetWidth,
  onFitPage,
  fullscreen,
  onToggleFullscreen,
}: {
  hasOutline: boolean;
  showToc: boolean;
  onToggleToc: () => void;
  current: number;
  numPages: number;
  pageInput: string;
  onPageInput: (value: string) => void;
  onSubmitPage: (e: React.FormEvent) => void;
  onPrev: () => void;
  onNext: () => void;
  scale: number;
  canZoomOut: boolean;
  canZoomIn: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onResetWidth: () => void;
  onFitPage: () => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  return (
    // 工具条:纯 UI chrome,禁止文本选中(按钮文字不该被选中)
    <div className="flex flex-wrap select-none items-center justify-center gap-x-4 gap-y-2 border-hairline border-y py-2">
      {hasOutline ? (
        <>
          <Button
            type="button"
            variant={showToc ? "secondary" : "ghost"}
            size="sm"
            className={toolBtn}
            onClick={onToggleToc}
          >
            目录
          </Button>
          <span className="h-4 w-px bg-hairline" />
        </>
      ) : null}
      <form onSubmit={onSubmitPage} className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={toolBtn}
          aria-label="上一页"
          disabled={current <= 1}
          onClick={onPrev}
        >
          ‹
        </Button>
        <input
          aria-label="页码"
          value={pageInput}
          onChange={(e) => onPageInput(e.target.value.replace(/\D/g, ""))}
          onBlur={onSubmitPage}
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
          onClick={onNext}
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
          disabled={!canZoomOut}
          onClick={onZoomOut}
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
          disabled={!canZoomIn}
          onClick={onZoomIn}
        >
          +
        </Button>
        <Button type="button" variant="ghost" size="sm" className={toolBtn} onClick={onResetWidth}>
          适宽
        </Button>
        <Button type="button" variant="ghost" size="sm" className={toolBtn} onClick={onFitPage}>
          整页
        </Button>
      </div>

      <span className="h-4 w-px bg-hairline" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={toolBtn}
        onClick={onToggleFullscreen}
      >
        {fullscreen ? "退出全屏" : "全屏"}
      </Button>
    </div>
  );
}
