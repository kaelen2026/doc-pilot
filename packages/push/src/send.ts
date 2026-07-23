import { type ApnsClient, isUnregisteredToken } from "./client";
import type { ApnsEnvironment, ApnsPayload, ApnsResponse } from "./types";

/** 一台投递目标:令牌 + 其注册环境(sandbox/production)。 */
export interface PushTarget {
  token: string;
  environment: ApnsEnvironment;
}

/** 一台设备的投递结果(令牌 + APNS 响应)。 */
export interface DeviceSendOutcome {
  token: string;
  response: ApnsResponse;
}

export interface SendToDevicesResult {
  outcomes: DeviceSendOutcome[];
  /** 应从库中清除的失效令牌(410/BadDeviceToken 等,见 isUnregisteredToken)。 */
  invalidTokens: string[];
}

/**
 * 把一条 payload 逐台投递给某用户的全部设备(provider 中立编排层)。
 * 投递量极小(一个用户的几台设备),故串行发送以保证结果顺序与设备一致。
 * 挑出失效令牌交由调用方清除;临时故障(429/5xx)不算失效,避免抖动误删。
 * api 的测试推送与 worker 的通知推送共用本函数。
 */
export async function sendToDevices(input: {
  client: ApnsClient;
  devices: PushTarget[];
  payload: ApnsPayload;
}): Promise<SendToDevicesResult> {
  const outcomes: DeviceSendOutcome[] = [];
  const invalidTokens: string[] = [];
  for (const d of input.devices) {
    const response = await input.client.send({
      deviceToken: d.token,
      environment: d.environment,
      payload: input.payload,
    });
    outcomes.push({ token: d.token, response });
    if (isUnregisteredToken(response)) {
      invalidTokens.push(d.token);
    }
  }
  return { outcomes, invalidTokens };
}
