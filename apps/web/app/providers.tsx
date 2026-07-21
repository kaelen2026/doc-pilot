"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { CommandPalette } from "@/components/command-palette";

export function Providers({ children }: { children: ReactNode }) {
  // 每个浏览器会话一个 QueryClient，惰性初始化避免 SSR/CSR 间共享状态。
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      {/* 全局命令面板(⌘K):挂在 QueryClientProvider 之下,任意页面可用;自身按会话启用。 */}
      <CommandPalette />
    </QueryClientProvider>
  );
}
