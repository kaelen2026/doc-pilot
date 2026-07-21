"use client";

import { useCallback, useEffect, useState } from "react";
import {
  nextChoice,
  parseThemeChoice,
  type ResolvedTheme,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemeChoice,
} from "./theme";

const MEDIA = "(prefers-color-scheme: dark)";

/** 把实际主题落到 <html data-theme>;CSS 据此覆盖 token 并声明 color-scheme。 */
function apply(resolved: ResolvedTheme) {
  document.documentElement.dataset.theme = resolved;
}

/**
 * 主题控制器:持有 choice(system/light/dark)与解析后的 resolved,
 * 负责持久化、应用到 <html>、以及 system 模式下响应系统偏好变化。
 * 首帧前已由 layout 的内联脚本设过 data-theme,这里只是接管后续变更(无闪烁)。
 */
export function useTheme() {
  // 惰性从 localStorage 读初值;SSR 阶段无 window,回退 system(与内联脚本口径一致)。
  const [choice, setChoiceState] = useState<ThemeChoice>(() => {
    if (typeof window === "undefined") {
      return "system";
    }
    return parseThemeChoice(window.localStorage.getItem(THEME_STORAGE_KEY));
  });
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  // choice 变化:算出 resolved、落到 <html>、持久化。
  useEffect(() => {
    const prefersDark = window.matchMedia(MEDIA).matches;
    const next = resolveTheme(choice, prefersDark);
    setResolved(next);
    apply(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  }, [choice]);

  // system 模式下,系统偏好切换要实时跟随;显式 light/dark 时忽略。
  useEffect(() => {
    if (choice !== "system") {
      return;
    }
    const mq = window.matchMedia(MEDIA);
    const onChange = () => {
      const next = resolveTheme("system", mq.matches);
      setResolved(next);
      apply(next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

  const cycle = useCallback(() => setChoiceState((c) => nextChoice(c)), []);
  const setChoice = useCallback((c: ThemeChoice) => setChoiceState(c), []);

  return { choice, resolved, cycle, setChoice };
}
