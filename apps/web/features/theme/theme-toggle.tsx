"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ThemeChoice } from "./theme";
import { useTheme } from "./use-theme";

const LABEL: Record<ThemeChoice, string> = {
  system: "跟随系统",
  light: "浅色",
  dark: "深色",
};

// 图标沿用仓库约定:内联 SVG + currentColor + stroke,尺寸由 Button 的 [&_svg] 归一到 size-4。
const ICON: Record<ThemeChoice, ReactNode> = {
  system: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      role="presentation"
      aria-hidden="true"
    >
      <rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1.25" />
      <path d="M6 13.75h4M8 11.25v2.5" strokeLinecap="round" />
    </svg>
  ),
  light: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      role="presentation"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M12.95 3.05l-1.06 1.06M4.11 11.89l-1.06 1.06" />
    </svg>
  ),
  dark: (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      role="presentation"
      aria-hidden="true"
    >
      <path d="M13.5 9.2A5.5 5.5 0 0 1 6.8 2.5a5.5 5.5 0 1 0 6.7 6.7Z" />
    </svg>
  ),
};

/** 主题切换:单键循环 跟随系统 → 浅色 → 深色。展示组件,状态全在 useTheme。 */
export function ThemeToggle() {
  const { choice, cycle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={cycle}
      aria-label={`切换主题,当前:${LABEL[choice]}`}
      title={`主题:${LABEL[choice]}`}
    >
      {ICON[choice]}
    </Button>
  );
}
