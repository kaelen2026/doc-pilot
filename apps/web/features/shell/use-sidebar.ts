"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { isImmersiveRoute } from "./route";
import { sidebarBaseCollapsed } from "./sidebar-state";

const STORAGE_KEY = "docpilot.sidebar.collapsed";
const MOBILE_QUERY = "(max-width: 767px)";

/**
 * 侧栏折叠控制器。两层意图叠加:
 * - 移动端与沉浸式路由(阅读/问答,见 route.ts)默认折叠,把横向空间让给正文;
 * - 其余页面用户可折叠,偏好持久化到 localStorage。
 *
 * 用一个「本次会话的临时覆盖」(override)承接用户点击:切换路由或响应式区间即清空,
 * 回到该环境默认。
 * 只有在非沉浸页折叠才写入持久化偏好——沉浸页展开是临时行为,不该污染列表页偏好。
 */
export function useSidebar() {
  const pathname = usePathname();
  const immersive = isImmersiveRoute(pathname);

  const [pref, setPref] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [override, setOverride] = useState<boolean | null>(null);

  // 首帧后读取持久化偏好(SSR 无 localStorage,故放 effect;折叠非首屏关键,轻微回填可接受)。
  useEffect(() => {
    try {
      setPref(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // localStorage 不可用(隐私模式等):退回默认展开。
    }
  }, []);

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const sync = () => setMobile(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // 路由或响应式区间变化即清临时覆盖,回到「该环境的默认」(移动/沉浸折叠 / 偏好)。
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname/mobile 是触发信号,非体内读取
  useEffect(() => {
    setOverride(null);
  }, [pathname, mobile]);

  const base = sidebarBaseCollapsed({ immersive, mobile, pref });
  const collapsed = override ?? base;

  const toggle = useCallback(() => {
    const next = !collapsed;
    setOverride(next);
    if (!immersive && !mobile) {
      setPref(next);
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // 同上:写入失败静默降级,不影响当次交互。
      }
    }
  }, [collapsed, immersive, mobile]);

  return { collapsed, toggle };
}
