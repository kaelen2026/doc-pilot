import type { ApnsResponse, ApnsSender, ApnsSendRequest, ApnsTokenSource } from "./types";

const HOSTS = {
  production: "api.push.apple.com",
  sandbox: "api.sandbox.push.apple.com",
} as const;

export interface ApnsClient {
  send(req: ApnsSendRequest): Promise<ApnsResponse>;
}

export interface CreateApnsClientInput {
  tokenSource: ApnsTokenSource;
  sender: ApnsSender;
  /** 默认 apns-topic(应用 bundle id)。 */
  bundleId: string;
}

function headerString(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * APNS 投递客户端(编排层):选环境 host、拼 /3/device/{token}、附 provider JWT 与
 * apns-topic/apns-push-type,委托注入的 sender 发出。不含网络细节(见 http2-sender.ts)。
 */
export function createApnsClient(input: CreateApnsClientInput): ApnsClient {
  const { tokenSource, sender, bundleId } = input;
  return {
    async send(req) {
      const headers: Record<string, string> = {
        authorization: `bearer ${tokenSource.token()}`,
        "apns-topic": req.topic ?? bundleId,
        "apns-push-type": "alert",
      };
      if (req.collapseId) {
        headers["apns-collapse-id"] = req.collapseId;
      }
      const res = await sender.post({
        host: HOSTS[req.environment],
        path: `/3/device/${req.deviceToken}`,
        headers,
        body: JSON.stringify(req.payload),
      });
      const apnsId = headerString(res.headers["apns-id"]);
      if (res.status >= 200 && res.status < 300) {
        return apnsId ? { status: res.status, apnsId } : { status: res.status };
      }
      // 非 2xx:APNS 在 body 里给出 reason(如 BadDeviceToken)。body 非 JSON 时静默忽略。
      let reason: string | undefined;
      try {
        reason = (JSON.parse(res.body) as { reason?: string }).reason;
      } catch {
        reason = undefined;
      }
      return {
        status: res.status,
        ...(reason ? { reason } : {}),
        ...(apnsId ? { apnsId } : {}),
      };
    },
  };
}

/**
 * 该响应是否表示「设备令牌已失效、应从库中清除」。
 * 410(Unregistered)或 400 家族里明确指向坏令牌的 reason 才算;429/5xx 等临时故障不算,
 * 以免因一次网络抖动误删有效令牌。
 */
export function isUnregisteredToken(res: Pick<ApnsResponse, "status" | "reason">): boolean {
  if (res.status === 410) {
    return true;
  }
  return (
    res.reason === "BadDeviceToken" ||
    res.reason === "Unregistered" ||
    res.reason === "DeviceTokenNotForTopic"
  );
}
