"use client";

import { useEffect, useState } from "react";

/** 防抖:value 稳定 delayMs 后才更新返回值。用于省下每次按键的搜索请求。 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
