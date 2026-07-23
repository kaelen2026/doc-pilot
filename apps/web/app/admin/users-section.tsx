"use client";

import { Badge } from "@/components/ui/badge";
import { formatCount } from "@/features/account/format";
import { useAdminUsers } from "@/features/admin/use-admin";
import { AdminSection } from "./admin-section";

/** 全量用户列表(GET /admin/users)。 */
export function UsersSection({ enabled }: { enabled: boolean }) {
  const query = useAdminUsers(enabled);

  function renderBody() {
    if (query.isError) {
      return <p className="px-5 py-5 text-seal text-sm">{String(query.error)}</p>;
    }
    if (!query.data) {
      return <p className="px-5 py-5 text-ink-faint text-sm">加载用户…</p>;
    }
    const rows = query.data.users;
    if (rows.length === 0) {
      return <p className="px-5 py-8 text-center text-ink-faint text-sm">暂无用户</p>;
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-faint text-xs">
              <th className="px-5 py-2 text-left font-normal">用户</th>
              <th className="px-5 py-2 text-left font-normal">邮箱</th>
              <th className="px-5 py-2 text-right font-normal">工作区</th>
              <th className="px-5 py-2 text-right font-normal">注册</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="px-5 py-2 text-ink">{u.name}</td>
                <td className="px-5 py-2">
                  <span className="flex items-center gap-2">
                    <span className="text-ink-soft">{u.email}</span>
                    {u.emailVerified ? null : (
                      <Badge variant="outline" className="text-ink-faint">
                        未验证
                      </Badge>
                    )}
                  </span>
                </td>
                <td className="px-5 py-2 text-right text-ink-soft tabular-nums">
                  {formatCount(u.workspaceCount)}
                </td>
                <td className="px-5 py-2 text-right text-ink-faint tabular-nums">
                  {u.createdAt.slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <AdminSection title="用户" description="全部注册用户">
      {renderBody()}
    </AdminSection>
  );
}
