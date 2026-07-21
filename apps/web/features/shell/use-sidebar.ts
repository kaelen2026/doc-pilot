"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { isImmersiveRoute } from "./route";

const STORAGE_KEY = "docpilot.sidebar.collapsed";

/**
 * 侧栏折叠控制器。两层意图叠加:
 * - 沉浸式路由(阅读/问答,见 route.ts)默认折叠,把横向空间让给正文;
 * - 其余页面用户可折叠,偏好持久化到 localStorage。
 *
 * 用一个「本次会话的临时覆盖」(override)承接用户点击:切换路由即清空,回到该路由默认。
 * 只有在非沉浸页折叠才写入持久化偏好——沉浸页展开是临时行为,不该污染列表页偏好。
 */
export function useSidebar() {
  const pathname = usePathname();
  const immersive = isImmersiveRoute(pathname);

  const [pref, setPref] = useState(false);
  const [override, setOverride] = useState<boolean | null>(null);

  // 首帧后读取持久化偏好(SSR 无 localStorage,故放 effect;折叠非首屏关键,轻微回填可接受)。
  useEffect(() => {
    try {
      setPref(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // localStorage 不可用(隐私模式等):退回默认展开。
    }
  }, []);

  // 路由变化即清临时覆盖,回到「该路由的默认」(沉浸折叠 / 偏好)。
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname 是触发信号,非体内读取
  useEffect(() => {
    setOverride(null);
  }, [pathname]);

  const base = immersive ? true : pref;
  const collapsed = override ?? base;

  const toggle = useCallback(() => {
    const next = !collapsed;
    setOverride(next);
    if (!immersive) {
      setPref(next);
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // 同上:写入失败静默降级,不影响当次交互。
      }
    }
  }, [collapsed, immersive]);

  return { collapsed, toggle };
}
