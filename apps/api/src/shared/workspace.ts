import { ForbiddenError } from "./errors";
import type { Membership } from "./types";

/**
 * 解析当前活跃 workspace。MVP:用户只有一个 personal workspace,取第一个 membership。
 * 租户隔离(ADR-008):service/repository 始终按该 workspaceId 过滤。
 */
export function activeWorkspaceId(memberships: Membership[]): string {
  const first = memberships[0];
  if (!first) {
    throw new ForbiddenError("no workspace for current user");
  }
  return first.workspaceId;
}
