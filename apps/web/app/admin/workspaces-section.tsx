"use client";

import { formatCount } from "@/features/account/format";
import { useAdminWorkspaces } from "@/features/admin/use-admin";
import { AdminSection } from "./admin-section";

/** 全量工作区列表(GET /admin/workspaces)。 */
export function WorkspacesSection({ enabled }: { enabled: boolean }) {
  const query = useAdminWorkspaces(enabled);

  function renderBody() {
    if (query.isError) {
      return <p className="px-5 py-5 text-seal text-sm">{String(query.error)}</p>;
    }
    if (!query.data) {
      return <p className="px-5 py-5 text-ink-faint text-sm">加载工作区…</p>;
    }
    const rows = query.data.workspaces;
    if (rows.length === 0) {
      return <p className="px-5 py-8 text-center text-ink-faint text-sm">暂无工作区</p>;
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-faint text-xs">
              <th className="px-5 py-2 text-left font-normal">名称</th>
              <th className="px-5 py-2 text-left font-normal">拥有者</th>
              <th className="px-5 py-2 text-right font-normal">文档</th>
              <th className="px-5 py-2 text-right font-normal">成员</th>
              <th className="px-5 py-2 text-right font-normal">创建</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((w) => (
              <tr key={w.id}>
                <td className="px-5 py-2 text-ink">{w.name}</td>
                <td className="px-5 py-2 text-ink-soft">{w.ownerEmail}</td>
                <td className="px-5 py-2 text-right text-ink-soft tabular-nums">
                  {formatCount(w.documentCount)}
                </td>
                <td className="px-5 py-2 text-right text-ink-soft tabular-nums">
                  {formatCount(w.memberCount)}
                </td>
                <td className="px-5 py-2 text-right text-ink-faint tabular-nums">
                  {w.createdAt.slice(0, 10)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <AdminSection title="工作区" description="全部工作区及其拥有者与规模">
      {renderBody()}
    </AdminSection>
  );
}
