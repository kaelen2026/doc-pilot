"use client";

import {
  DEVICE_GRANT_TYPE,
  SCAN_LOGIN_CLIENT_ID,
  SCAN_LOGIN_POLL_INTERVAL_SEC,
} from "@doc-pilot/contracts";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { classifyPollResult, type PollOutcome, type RawPollResult } from "./poll";
import type { DeviceCodeData } from "./types";

/**
 * 把 /device/token 返回的 bearer access_token 换成 web 的 HttpOnly cookie 会话。
 * device-authorization 的 token 端点只回 bearer、不种 cookie,而 web 是 cookie 认证,
 * 故批准后必须调 /scan-login/adopt 才能真正登录(见 ADR-011 / scan-login-cookie.ts)。
 * 走 authClient.$fetch(而非裸 fetch),复用其 baseURL/basePath、credentials 与错误形状。
 */
async function adoptSession(token: string): Promise<boolean> {
  const { error } = await authClient.$fetch("/scan-login/adopt", {
    method: "POST",
    body: { token },
  });
  return !error;
}

/** 页面级状态:取码中 + poll 的五种语义结果。 */
export type ScanStatus = "loading" | PollOutcome;

/** /device/code 响应(better-auth 客户端对该端点类型较松,本地收窄)。 */
interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri_complete: string;
  interval: number;
  expires_in: number;
}

// better-auth 客户端由 pathMethods 动态生成,类型较松;此处收窄到我们要用的两个动作。
const device = authClient.device as {
  code: (body: { client_id: string }) => Promise<RawPollResult>;
  token: (body: {
    grant_type: string;
    device_code: string;
    client_id: string;
  }) => Promise<RawPollResult>;
};

/**
 * 扫码登录控制器。取一次设备码(可 regenerate),按服务端 interval 轮询 /device/token,
 * 批准后刷新会话并跳转 /documents。对外暴露状态值 + 动词化操作,不泄漏内部 setter/query。
 */
export function useScanLogin() {
  // 递增以强制重取设备码(过期后「重新生成」)。
  const [generation, setGeneration] = useState(0);

  const codeQuery = useQuery({
    queryKey: ["scan-login-code", generation],
    queryFn: async (): Promise<DeviceCodeData> => {
      const { data, error } = await device.code({ client_id: SCAN_LOGIN_CLIENT_ID });
      if (error || !data) throw new Error("取码失败");
      const d = data as DeviceCodeResponse;
      return {
        deviceCode: d.device_code,
        userCode: d.user_code,
        verificationUriComplete: d.verification_uri_complete,
        intervalSec: d.interval || SCAN_LOGIN_POLL_INTERVAL_SEC,
        expiresInSec: d.expires_in,
      };
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const deviceCode = codeQuery.data?.deviceCode ?? null;
  const intervalMs = (codeQuery.data?.intervalSec ?? SCAN_LOGIN_POLL_INTERVAL_SEC) * 1000;

  const tokenQuery = useQuery({
    queryKey: ["scan-login-token", deviceCode],
    enabled: deviceCode !== null,
    // 服务端是唯一事实源:每次轮询把结果分类;终态后停轮询。
    refetchInterval: (query) => {
      const outcome = query.state.data;
      return outcome && outcome !== "waiting" ? false : intervalMs;
    },
    refetchOnWindowFocus: false,
    gcTime: 0,
    retry: false,
    queryFn: async (): Promise<PollOutcome> => {
      const res = await device.token({
        grant_type: DEVICE_GRANT_TYPE,
        // enabled 保证 deviceCode 非空。
        device_code: deviceCode as string,
        client_id: SCAN_LOGIN_CLIENT_ID,
      });
      const outcome = classifyPollResult(res);
      // 批准后拿到 bearer token,还需换成 cookie 会话(token 端点不种 cookie)。
      if (outcome === "approved") {
        const token = (res.data as { access_token?: string } | undefined)?.access_token;
        if (!token || !(await adoptSession(token))) return "error";
      }
      return outcome;
    },
  });

  const outcome = tokenQuery.data;

  // 批准并领取 cookie 后进入工作台。用整页跳转而非 router.push:cookie 是经自定义端点
  // 带外种下的,不会像 signIn 那样刷新 useSession 的响应式 store,软导航后工作台仍读到旧的
  // 未登录态(需手动刷新才对)。整页加载让工作台按新 cookie 重新拉会话,等效于用户手刷。
  useEffect(() => {
    if (outcome !== "approved") return;
    window.location.assign("/documents");
  }, [outcome]);

  const regenerate = useCallback(() => setGeneration((g) => g + 1), []);

  const status: ScanStatus = codeQuery.isError
    ? "error"
    : !codeQuery.data
      ? "loading"
      : (outcome ?? "waiting");

  return {
    status,
    /** 编入二维码的深链;loading 时为 null。 */
    qrValue: codeQuery.data?.verificationUriComplete ?? null,
    /** 扫不动时可读出的短码。 */
    userCode: codeQuery.data?.userCode ?? null,
    /** 过期/出错后重新取码。 */
    regenerate,
  };
}
