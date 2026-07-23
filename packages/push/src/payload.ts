import type { ApnsPayload } from "./types";

export interface AlertPayloadInput {
  title: string;
  body?: string;
  badge?: number;
  /** 声音文件名;缺省 "default"(测试推送要能听见)。传 null 由调用方自行拼可实现静音,此处不做。 */
  sound?: string;
  /** 自定义键值,作为 aps 的同级兄弟(deep-link:type / resourceType / resourceId 等)。 */
  data?: Record<string, unknown>;
}

/**
 * 构造一条 alert 类推送载荷(纯函数)。
 * data 先铺底、aps 后覆盖,确保保留键 `aps` 不被 data 里的同名键篡改。
 */
export function buildAlertPayload(input: AlertPayloadInput): ApnsPayload {
  const alert: { title?: string; body?: string } = { title: input.title };
  if (input.body !== undefined) {
    alert.body = input.body;
  }
  const aps: ApnsPayload["aps"] = {
    alert,
    sound: input.sound ?? "default",
  };
  if (input.badge !== undefined) {
    aps.badge = input.badge;
  }
  return { ...input.data, aps };
}
