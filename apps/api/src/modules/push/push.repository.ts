import type { PushEnvironment, PushPlatform } from "@doc-pilot/contracts";
import { db } from "@doc-pilot/database";
import { pushDevices } from "@doc-pilot/database/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

/**
 * 设备令牌数据访问层。
 *
 * 与其它模块的 `scoped*(workspaceId)` 工厂不同,本表**按用户身份键控,不做 workspace 作用域**
 * ——设备属于一个登录用户而非某工作区(见 push_devices 表注释与 ADR-008)。故这里的函数以
 * `userId` 为过滤维度:注册/注销由用户本人发起(userId 取自认证上下文),admin 发测试推送时
 * 按用户查其令牌(经 admin 的跨租户查询路径)。业务/租户代码不应按 workspace 期待本表。
 */

export interface StoredDevice {
  token: string;
  platform: string;
  environment: string;
}

/** 注册/刷新设备令牌。token 唯一 → 冲突即更新(换绑用户/环境并刷新 last_seen),保证幂等。 */
export async function upsertDevice(input: {
  userId: string;
  token: string;
  platform: PushPlatform;
  environment: PushEnvironment;
}): Promise<void> {
  await db
    .insert(pushDevices)
    .values({
      userId: input.userId,
      token: input.token,
      platform: input.platform,
      environment: input.environment,
    })
    .onConflictDoUpdate({
      target: pushDevices.token,
      set: {
        userId: input.userId,
        platform: input.platform,
        environment: input.environment,
        lastSeenAt: sql`now()`,
      },
    });
}

/** 某用户的全部设备令牌。 */
export function listByUserId(userId: string): Promise<StoredDevice[]> {
  return db
    .select({
      token: pushDevices.token,
      platform: pushDevices.platform,
      environment: pushDevices.environment,
    })
    .from(pushDevices)
    .where(eq(pushDevices.userId, userId));
}

/** 注销单个令牌;限定 userId,用户只能删自己的设备。 */
export async function deleteByToken(input: { userId: string; token: string }): Promise<void> {
  await db
    .delete(pushDevices)
    .where(and(eq(pushDevices.userId, input.userId), eq(pushDevices.token, input.token)));
}

/**
 * 清除一批失效令牌(APNS 判定 Unregistered/BadDeviceToken)。token 全局唯一,无需按用户限定。
 * 理论竞态:若某令牌在测试发送时被判失效,却在清除前被另一用户重新注册(设备转手),会误删这条
 * 新注册。影响可忽略且自愈——设备下次启动即重新上报。故不加锁,保持简单。
 */
export async function deleteByTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) {
    return;
  }
  await db.delete(pushDevices).where(inArray(pushDevices.token, tokens));
}
