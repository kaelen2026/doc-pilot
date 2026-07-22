import { DEVICE_TOKEN_ERRORS } from "@doc-pilot/contracts";

/** 一次 /device/token 轮询后的语义结果。 */
export type PollOutcome = "waiting" | "approved" | "denied" | "expired" | "error";

/** better-auth 客户端调用的返回形状(data 或 RFC 8628 错误体)。字段位置在不同版本略有出入,故都探一遍。 */
export interface RawPollResult {
  data?: unknown;
  error?: { error?: string; code?: string; message?: string; status?: number } | null;
}

/** 从可能的多个字段里取出 RFC 错误码(error / code / message)。 */
function pollErrorCode(error: RawPollResult["error"]): string | null {
  if (!error) return null;
  return error.error ?? error.code ?? error.message ?? null;
}

/**
 * 把 device/token 轮询结果映射为语义状态。
 * - 有 data 且无 error:已批准,web 会话已建立。
 * - authorization_pending / slow_down:继续等待。
 * - access_denied:用户在手机上拒绝。
 * - expired_token:二维码过期,需重新生成。
 * - 其它:未知/网络错误。
 */
export function classifyPollResult(res: RawPollResult): PollOutcome {
  if (res.data && !res.error) return "approved";
  switch (pollErrorCode(res.error)) {
    case DEVICE_TOKEN_ERRORS.authorizationPending:
    case DEVICE_TOKEN_ERRORS.slowDown:
      return "waiting";
    case DEVICE_TOKEN_ERRORS.accessDenied:
      return "denied";
    case DEVICE_TOKEN_ERRORS.expiredToken:
      return "expired";
    default:
      return "error";
  }
}
