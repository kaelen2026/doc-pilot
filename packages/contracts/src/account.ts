/**
 * 账户注销冷静期。请求注销后账户进入冷静期:期间账户被冻结(仅能撤销或退出登录),
 * 到期后由 worker 周期扫描执行硬删除(级联清库 + 清对象存储)。
 *
 * 三处以此常量为准:API 计算 deletion_scheduled_at、前端展示到期时间、worker 判定是否到期。
 */
export const ACCOUNT_DELETION_COOLDOWN_DAYS = 7;
export const ACCOUNT_DELETION_COOLDOWN_MS = ACCOUNT_DELETION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

/**
 * 账户清理(Purge)周期任务参数(仿 RECONCILE):worker 周期扫描 deletion_scheduled_at <= now
 * 的到期账户并硬删除。间隔放契约层而非 env(与 reconcile 一致,见 processing.ts 的 RECONCILE)。
 */
export const ACCOUNT_PURGE = {
  /** 扫描周期。 */
  intervalMs: 60_000,
  /** 单轮处理的到期账户上限。 */
  batchSize: 100,
} as const;

/**
 * 对象存储清理(死信 drain):删 user 后待删的 S3 对象由 pending_object_deletions 持久记录,
 * worker 周期 drain。attempts 达 maxAttempts 的行不再重试,留作死信供运维排查。
 */
export const OBJECT_PURGE = {
  /** 单轮 drain 的对象上限。 */
  batchSize: 500,
  /** 单个对象的最大重试次数;超过则停手(死信),不再刷屏。 */
  maxAttempts: 10,
} as const;
