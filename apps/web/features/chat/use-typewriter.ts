"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "./use-reduced-motion";

/**
 * 打字机揭示:target 只增(delta 追加),逐帧把已显示长度推向 target。
 * 落后越多每帧吐越多,避免模型一次吐一大段时「跳段」或拖尾;追上即停帧。
 * prefers-reduced-motion 下直接全量,不做动画。
 */
export function useTypewriter(target: string): string {
  const [shown, setShown] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) {
      setShown(target.length);
      return;
    }
    let frame = 0;
    let cancelled = false;
    function step() {
      if (cancelled) {
        return;
      }
      let done = false;
      setShown((cur) => {
        if (cur >= target.length) {
          done = true;
          return cur;
        }
        const remaining = target.length - cur;
        const next = Math.min(target.length, cur + Math.max(1, Math.floor(remaining / 6)));
        done = next >= target.length;
        return next;
      });
      if (!done) {
        frame = requestAnimationFrame(step);
      }
    }
    frame = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [target, reduce]);

  return reduce ? target : target.slice(0, shown);
}
