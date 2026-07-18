import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 让 <Link href> 与 router.push 按真实路由做类型校验（Next 16 稳定的顶层配置）。
  typedRoutes: true,
  // 产出自包含运行时(.next/standalone),用于最小化生产镜像。
  output: "standalone",
  // monorepo 下把文件追踪根设到仓库根,standalone 才能正确收集依赖。
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
};

export default nextConfig;
