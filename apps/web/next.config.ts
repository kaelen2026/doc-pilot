import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 让 <Link href> 与 router.push 按真实路由做类型校验（Next 16 稳定的顶层配置）。
  typedRoutes: true,
};

export default nextConfig;
