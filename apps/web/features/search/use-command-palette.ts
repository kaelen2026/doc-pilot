"use client";

import { useCallback, useEffect, useState } from "react";

/** 请求打开命令面板的全局事件——供不在同一组件树的入口(如文档页头部按钮)触发。 */
const OPEN_EVENT = "command-palette:open";

/** 从任意组件请求打开命令面板(与 useCommandPalette 解耦,不必共享 state)。 */
export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * 命令面板开合状态 + 全站唯一的全局快捷键落点:⌘K / Ctrl+K 切换开合。
 * 同时监听 openCommandPalette() 派发的事件,让跨组件树的入口也能打开。
 * enabled 为 false(如未登录)时不注册任何监听。
 */
export function useCommandPalette(enabled: boolean) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [enabled]);

  const close = useCallback(() => setOpen(false), []);
  return { open, setOpen, close };
}
