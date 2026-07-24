import { db } from "@doc-pilot/database";
import { pushDevices } from "@doc-pilot/database/schema";
import type { ApnsEnvironment } from "@doc-pilot/push";
import { eq, inArray } from "drizzle-orm";

/**
 * Worker 侧设备令牌读/清理(镜像 apps/api 的 push.repository)。设备**按用户身份键控,
 * 不做 workspace 作用域**——设备属于登录用户而非某工作区(见 push_devices 表注释、ADR-008)。
 */

/** 某用户的全部设备(令牌 + 注册环境),用于给该用户发角标推送。 */
export interface MobilePushTarget {
  token: string;
  platform: string;
  environment: ApnsEnvironment;
}

export async function listDevicesByUserId(userId: string): Promise<MobilePushTarget[]> {
  const rows = await db
    .select({
      token: pushDevices.token,
      platform: pushDevices.platform,
      environment: pushDevices.environment,
    })
    .from(pushDevices)
    .where(eq(pushDevices.userId, userId));
  // 库内 environment 受注册时的枚举校验保护,只会是 sandbox / production。
  return rows.map((r) => ({
    token: r.token,
    platform: r.platform,
    environment: r.environment as ApnsEnvironment,
  }));
}

/** 清除一批 APNS 判失效(Unregistered/BadDeviceToken)的令牌。token 全局唯一,无需按用户限定。 */
export async function deleteInvalidTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) {
    return;
  }
  await db.delete(pushDevices).where(inArray(pushDevices.token, tokens));
}
