import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { API_URL } from "./env";

// API 源站；Better Auth 客户端会自动追加 basePath /api/auth。
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [emailOTPClient()],
});
