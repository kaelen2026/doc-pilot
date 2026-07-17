// 前端可见的运行时配置。NEXT_PUBLIC_* 在构建期被内联，集中一处导出，
// 避免各文件重复写 fallback（原来 auth-client 和 use-documents 各写了一份）。
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
