"use client";

import {
  DEVICE_GRANT_TYPE,
  SCAN_LOGIN_CLIENT_ID,
  SCAN_LOGIN_POLL_INTERVAL_SEC,
} from "@doc-pilot/contracts";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { classifyPollResult, type PollOutcome, type RawPollResult } from "./poll";
import type { DeviceCodeData } from "./types";

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
  const router = useRouter();
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
      return classifyPollResult(res);
    },
  });

  const outcome = tokenQuery.data;

  // 批准后:/device/token 已下发会话 cookie,刷新 better-auth 会话态后进入工作台。
  useEffect(() => {
    if (outcome !== "approved") return;
    let cancelled = false;
    void authClient.getSession().finally(() => {
      if (!cancelled) router.push("/documents");
    });
    return () => {
      cancelled = true;
    };
  }, [outcome, router]);

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
