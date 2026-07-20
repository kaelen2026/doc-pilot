"use client";

import { useEffect, useState } from "react";

/**
 * 是否偏好减少动效(prefers-reduced-motion: reduce)。跟随系统设置变化。
 * 打字机、跟随滚动等动效统一读它,避免多处各写一份 matchMedia。
 */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduce;
}
