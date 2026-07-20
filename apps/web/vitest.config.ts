import path from "node:path";
import { defineConfig } from "vitest/config";

// web 单测覆盖抽出的纯逻辑(几何/引用解析/SSE 帧解析等)。
// `@` 别名与 tsconfig 一致,使测试能 import 使用 `@/` 的源码模块。
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
});
