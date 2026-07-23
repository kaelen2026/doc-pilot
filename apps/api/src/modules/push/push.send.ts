import type { ApnsResponse } from "@doc-pilot/push";
import { isUnregisteredToken } from "@doc-pilot/push";

/** 一台设备的投递结果(令牌 + APNS 响应)。 */
export interface DeviceSendOutcome {
  token: string;
  response: ApnsResponse;
}

/** 单条展示结果:令牌已脱敏,不回显完整令牌。 */
export interface DisplaySendResult {
  token: string;
  status: number;
  reason?: string;
}

export interface TestSendSummary {
  requested: number;
  sent: number;
  failed: number;
  /** 应从库中清除的失效完整令牌(未脱敏,供 repository 删除)。 */
  invalidTokens: string[];
  /** 逐设备展示结果(令牌脱敏)。 */
  results: DisplaySendResult[];
}

/** 令牌脱敏:仅保留末 8 位,避免完整令牌出现在 API 响应/日志里。 */
export function maskToken(token: string): string {
  return token.length <= 8 ? token : `…${token.slice(-8)}`;
}

/**
 * 汇总一批投递结果(纯函数):统计成功/失败、挑出应清除的失效令牌、生成脱敏展示结果。
 * 「失效」判定复用 @doc-pilot/push 的 isUnregisteredToken(410/BadDeviceToken 等),
 * 临时故障(429/5xx)不清除,避免抖动误删有效令牌。
 */
export function summarizeTestSend(outcomes: DeviceSendOutcome[]): TestSendSummary {
  let sent = 0;
  const invalidTokens: string[] = [];
  const results = outcomes.map(({ token, response }) => {
    if (response.status >= 200 && response.status < 300) {
      sent++;
    }
    if (isUnregisteredToken(response)) {
      invalidTokens.push(token);
    }
    return {
      token: maskToken(token),
      status: response.status,
      ...(response.reason ? { reason: response.reason } : {}),
    };
  });
  return {
    requested: outcomes.length,
    sent,
    failed: outcomes.length - sent,
    invalidTokens,
    results,
  };
}
