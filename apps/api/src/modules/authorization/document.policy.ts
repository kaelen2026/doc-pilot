import type { Membership } from "../../shared/types";

/**
 * 授权决策（纯函数，便于单测）。对应 docs/architecture/cross-cutting.md §25。
 *
 * 租户隔离（ADR-008）：任何访问都先校验用户是否属于目标 workspace。
 * Phase 3 的 DocumentPolicy（canRead/canDelete/canAsk）将先加载文档，
 * 再用 document.workspaceId 委托给这里的 canAccessWorkspace。
 */
export function canAccessWorkspace(memberships: Membership[], workspaceId: string): boolean {
  return memberships.some((m) => m.workspaceId === workspaceId);
}

export function isWorkspaceOwner(memberships: Membership[], workspaceId: string): boolean {
  return memberships.some((m) => m.workspaceId === workspaceId && m.role === "owner");
}
