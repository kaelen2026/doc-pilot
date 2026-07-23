import type { ApnsClient, ApnsEnvironment } from "@doc-pilot/push";
import { buildAlertPayload, sendToDevices } from "@doc-pilot/push";
import * as repo from "./push.repository";
import type { RegisterDeviceInput } from "./push.schema";
import { summarizeTestSend, type TestSendSummary } from "./push.send";

/** 注册/刷新当前用户的设备令牌(幂等)。 */
export function registerDevice(input: RegisterDeviceInput & { userId: string }): Promise<void> {
  return repo.upsertDevice(input);
}

/** 注销当前用户的某个设备令牌。 */
export function unregisterDevice(input: { userId: string; token: string }): Promise<void> {
  return repo.deleteByToken(input);
}

/**
 * 给某用户的全部设备发一条测试推送,汇总结果并清除失效令牌。
 * apns 客户端由调用方注入(admin 路由传 apiApnsClient),便于单测替身、也避免本模块读 env。
 * 逐台串行投递:测试推送量极小,顺序发即可保证结果顺序与设备一致。
 */
export async function sendTestPushToUser(input: {
  userId: string;
  title: string;
  body?: string;
  /** 角标数 = 收件人真实未读数(由调用方算好);与"角标恒等于未读数"模型一致。0 会显式清除红点。 */
  badge?: number;
  apns: ApnsClient;
}): Promise<TestSendSummary> {
  const devices = await repo.listByUserId(input.userId);
  const payload = buildAlertPayload({
    title: input.title,
    body: input.body,
    badge: input.badge,
    data: { type: "admin.test" },
  });
  const { outcomes } = await sendToDevices({
    client: input.apns,
    // 库内 environment 受注册时的枚举校验保护,只会是 sandbox / production。
    devices: devices.map((d) => ({
      token: d.token,
      environment: d.environment as ApnsEnvironment,
    })),
    payload,
  });
  const summary = summarizeTestSend(outcomes);
  await repo.deleteByTokens(summary.invalidTokens);
  return summary;
}
