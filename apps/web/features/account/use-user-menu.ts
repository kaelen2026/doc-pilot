"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 头部头像下拉的开合控制器:持有 open 状态,并在打开时监听
 * Escape 与容器外点击以关闭(照命令面板/抽屉的 Escape 关闭约定)。
 * 把 containerRef 挂到「按钮 + 菜单」的外层容器上,点容器外即收起。
 */
export function useUserMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(e: PointerEvent) {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, toggle, close, containerRef };
}
