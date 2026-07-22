import {
  deviceAuthorizationClient,
  emailOTPClient,
  oneTapClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { API_URL, GOOGLE_CLIENT_ID } from "./env";

// API 源站；Better Auth 客户端会自动追加 basePath /api/auth。
// oneTapClient 始终注册以保持 authClient.oneTap 的类型可用;clientId 为空时不主动触发提示
// （见 features/auth/use-google-one-tap.ts 的守卫）。
// deviceAuthorizationClient:扫码登录用,提供 device.code / device.token(见 ADR-011)。
export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    emailOTPClient(),
    oneTapClient({ clientId: GOOGLE_CLIENT_ID }),
    deviceAuthorizationClient(),
  ],
});
