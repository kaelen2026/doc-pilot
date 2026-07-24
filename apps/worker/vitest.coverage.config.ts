import { defineConfig } from "vitest/config";

// coverage 专用口径:单测 + 集成测试一起统计(与 apps/api 同理)。repository/outbox
// 的守卫行为由集成测试钉住,只统计单测会让覆盖率虚低。集成部分需要本地基建
// (pnpm compose:up);CI 的 coverage job 配有 Postgres/Redis service。
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
  },
});
