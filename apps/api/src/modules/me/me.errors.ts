import { DomainError } from "../../shared/errors";

/**
 * 账户处于注销冷静期(deletion_scheduled_at 非空)。业务端点一律拒绝(冻结);
 * 前端据此把用户重定向到「恢复账户」页。放行的仅 /me 与 /me/deletion(读状态 / 撤销)。
 */
export class AccountPendingDeletionError extends DomainError {
  constructor(message = "account pending deletion") {
    super("account_pending_deletion", message, 403);
  }
}
