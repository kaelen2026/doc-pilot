import { Badge } from "@/components/ui/badge";
import type { WorkspaceMembership } from "@/features/account/types";
import { SettingsSection } from "./settings-section";

const ROLE_LABEL: Record<string, string> = {
  owner: "所有者",
  admin: "管理员",
  member: "成员",
};

/** 工作区:用户所属的 workspace 列表 + 角色。 */
export function WorkspacesSection({ workspaces }: { workspaces: WorkspaceMembership[] }) {
  return (
    <SettingsSection title="工作区" description="你所属的工作区及角色">
      {workspaces.length === 0 ? (
        <p className="px-5 py-5 text-ink-faint text-sm">暂无工作区</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {workspaces.map((ws) => (
            <li key={ws.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <span className="truncate text-ink text-sm">{ws.name}</span>
              <Badge>{ROLE_LABEL[ws.role] ?? ws.role}</Badge>
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
