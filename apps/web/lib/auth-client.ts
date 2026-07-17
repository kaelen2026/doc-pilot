import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// API 源站；Better Auth 客户端会自动追加 basePath /api/auth。
const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const authClient = createAuthClient({
  baseURL,
  plugins: [emailOTPClient()],
});
