"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { GOOGLE_CLIENT_ID } from "@/lib/env";

/**
 * Google One Tap(Chrome「一步登录」):进入登录页即用 GSI 弹出账号,点一下直接登录。
 * 仅在配了公开 GOOGLE_CLIENT_ID 时触发;登录成功由 better-auth 的响应钩子按 callbackURL
 * 自动跳工作台。用户关闭提示 / 无可用账号 / 脚本加载失败都静默降级到验证码/密码/按钮。
 */
export function useGoogleOneTap() {
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    authClient
      .oneTap({
        callbackURL: "/documents",
        // 提示被跳过/关闭(点叉、浏览器抑制)时回调,这里静默不打断页面。
        onPromptNotification: () => {},
      })
      .catch(() => {});
  }, []);
}
