"use client";

import { SEARCH } from "@doc-pilot/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { moveSelection } from "@/features/search/selection";
import { useCommandPalette } from "@/features/search/use-command-palette";
import { useSearch } from "@/features/search/use-search";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/**
 * 全局命令面板(⌘K):跨全部文档的语义搜索。挂在 providers 里,任意页面可用。
 * 浮层照 source-drawer 的 portal + Escape 模式;仅登录后启用。
 * 键盘:↑↓ 选择(moveSelection 纯函数)、↵ 打开选中文档、esc 关闭。
 */
export function CommandPalette() {
  const { data: session } = authClient.useSession();
  const enabled = !!session;
  const { open, close } = useCommandPalette(enabled);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(-1);
  const router = useRouter();

  const search = useSearch(query);
  const results = search.data ?? [];

  // 关闭后清空查询与选中项,下次打开是干净状态。
  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelected(-1);
    }
  }, [open]);

  // 结果集变化即把选中项复位,避免下标越界。
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在结果数据本身变化时复位,不随 selected 重跑。
  useEffect(() => {
    setSelected(-1);
  }, [search.data]);

  if (!enabled || !open) {
    return null;
  }

  function openResult(index: number) {
    const result = results[index];
    if (!result) {
      return;
    }
    const page = result.passages[0]?.pageStart ?? null;
    close();
    router.push(
      page
        ? `/documents/${result.documentId}/view?page=${page}`
        : `/documents/${result.documentId}/view`,
    );
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => moveSelection(s, 1, results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => moveSelection(s, -1, results.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      openResult(selected < 0 ? 0 : selected);
    }
  }

  function renderResults() {
    if (!search.enabled) {
      return (
        <p className="px-3 py-6 text-center text-ink-faint text-sm">
          输入至少 {SEARCH.minQueryLength} 个字符,搜索所有文档内容
        </p>
      );
    }
    if (search.isPending) {
      return <p className="px-3 py-6 text-center text-ink-faint text-sm">搜索中…</p>;
    }
    if (search.isError) {
      return <p className="px-3 py-6 text-center text-seal text-sm">{String(search.error)}</p>;
    }
    if (results.length === 0) {
      return <p className="px-3 py-6 text-center text-ink-faint text-sm">没有找到相关内容</p>;
    }
    return (
      <ul className="space-y-1">
        {results.map((result, i) => {
          const page = result.passages[0]?.pageStart ?? null;
          const snippet = result.passages[0]?.content ?? "";
          return (
            <li key={result.documentId}>
              <button
                type="button"
                role="option"
                aria-selected={i === selected}
                onClick={() => openResult(i)}
                onMouseEnter={() => setSelected(i)}
                className={cn(
                  "block w-full rounded-md px-3 py-2 text-left transition-colors duration-100",
                  i === selected ? "bg-paper-sunken" : "bg-transparent",
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-medium text-ink text-sm">{result.title}</span>
                  {page ? (
                    <span className="shrink-0 text-ink-faint text-xs tabular-nums">
                      第 {page} 页
                    </span>
                  ) : null}
                </div>
                {snippet ? (
                  <p className="mt-0.5 line-clamp-2 text-ink-soft text-xs leading-[1.6]">
                    {snippet}
                  </p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: 遮罩层仅用于「点击遮罩本体关闭」,不是交互控件;真正的控件是内部输入框与结果项(键盘用户用 Esc 关闭)。
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-[12vh]"
      // 仅当点击落在遮罩本体(而非内部面板)时关闭,面板因此无需 onClick 阻止冒泡。
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          close();
        }
      }}
      role="presentation"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-xl border-hairline border bg-paper shadow-[0_24px_70px_-24px_rgba(0,0,0,0.45)] animate-[rise_0.2s_cubic-bezier(0.2,0,0,1)_both]">
        <div className="border-hairline border-b p-2">
          {/* 命令面板打开即应聚焦输入,这正是其交互契约。 */}
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索所有文档内容…"
            role="combobox"
            aria-expanded
            aria-controls="command-palette-results"
            aria-autocomplete="list"
            aria-label="搜索所有文档内容"
            className="border-0 shadow-none focus:ring-0"
          />
        </div>
        <div
          id="command-palette-results"
          role="listbox"
          aria-label="搜索结果"
          aria-live="polite"
          className="max-h-[50vh] overflow-y-auto p-2"
        >
          {renderResults()}
        </div>
        <div className="border-hairline border-t px-3 py-2 text-[11px] text-ink-faint">
          ↑↓ 选择 · ↵ 打开 · esc 关闭
        </div>
      </div>
    </div>,
    document.body,
  );
}
