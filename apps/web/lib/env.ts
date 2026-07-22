// 前端可见的运行时配置。NEXT_PUBLIC_* 在构建期被内联，集中一处导出，
// 避免各文件重复写 fallback（原来 auth-client 和 use-documents 各写了一份）。
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
// 是否展示 Google 登录按钮。后端(packages/auth)只有凭据齐备才注册 Google provider,
// 前端据此决定是否渲染按钮,避免展示一个必然报错的入口。未配置默认隐藏。
export const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_ENABLED === "true";
