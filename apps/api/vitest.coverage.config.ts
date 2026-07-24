import { defineConfig } from "vitest/config";

// coverage 专用口径:单测 + 集成测试一起统计。route/service/repository 的行为主要由
// 集成测试钉住,只统计单测会让覆盖率虚低(曾长期显示 38%)。集成部分需要本地基建
// (pnpm compose:up);CI 的 coverage job 配有 Postgres/Redis service。
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
  },
});
