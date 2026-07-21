"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDocuments } from "@/features/documents/use-documents";
import { cn } from "@/lib/utils";

// 与 documents-view 口径一致:就绪可问答,其余(含失败)只要上传完成即可在线阅读。
const ASKABLE = new Set(["ready", "partially_ready"]);
const READABLE = new Set([
  "uploaded",
  "queued",
  "processing",
  "ready",
  "partially_ready",
  "failed",
]);

// 快切默认落点:能问答就进问答,否则能读就进阅读。
function quickHref(id: string, status: string): string | null {
  if (ASKABLE.has(status)) {
    return `/documents/${id}/chat`;
  }
  if (READABLE.has(status)) {
    return `/documents/${id}/view`;
  }
  return null;
}

/** 从当前路径取正在查看的文档 id,用于高亮列表项。 */
function activeDocId(pathname: string): string | null {
  return /^\/documents\/([^/]+)\/(?:view|chat)/.exec(pathname)?.[1] ?? null;
}

/**
 * 侧栏文档快切列表。折叠时整块隐藏(窄栏放不下标题,快切价值也随之消失)。
 * 数据走 useDocuments(与列表页共享 react-query 缓存,处理中自动轮询)。
 */
export function SidebarDocs({ collapsed, enabled }: { collapsed: boolean; enabled: boolean }) {
  const pathname = usePathname();
  const { data: docs } = useDocuments(enabled);

  if (collapsed) {
    return null;
  }

  const currentId = activeDocId(pathname);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="px-4 pb-1.5 font-medium text-ink-faint text-xs tracking-wide">文档</p>
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {docs === undefined ? (
          <p className="px-2.5 py-1.5 text-ink-faint text-xs">加载中…</p>
        ) : docs.length === 0 ? (
          <p className="px-2.5 py-1.5 text-ink-faint text-xs leading-[1.6]">还没有文档</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {docs.map((d) => {
              const href = quickHref(d.id, d.status);
              const active = d.id === currentId;
              const inFlight = d.status === "queued" || d.status === "processing";
              const dot = (
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    inFlight
                      ? "bg-seal"
                      : d.status === "failed"
                        ? "bg-ink-faint"
                        : "bg-transparent",
                  )}
                />
              );
              const rowClass = cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors duration-150",
                active
                  ? "bg-accent font-medium text-ink"
                  : "text-ink-soft [@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-ink",
              );
              return (
                <li key={d.id}>
                  {href ? (
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(rowClass, "focus-visible:outline-2 focus-visible:outline-ring")}
                    >
                      {dot}
                      <span className="truncate">{d.title}</span>
                    </Link>
                  ) : (
                    <span className={cn(rowClass, "cursor-default")} title={d.title}>
                      {dot}
                      <span className="truncate">{d.title}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
