"use client";

import { formatCount } from "@/features/account/format";
import { formatCostMicros } from "@/features/admin/format";
import { useAdminOverview } from "@/features/admin/use-admin";
import { AdminSection } from "./admin-section";

/** 单个统计块:大数字 + 标签。 */
function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 px-5 py-4">
      <span className="font-display font-medium text-2xl text-ink tabular-nums tracking-[-0.01em]">
        {value}
      </span>
      <span className="text-ink-faint text-xs">{label}</span>
    </div>
  );
}

/** 平台总览:五个关键计数/汇总(GET /admin/overview)。 */
export function OverviewSection({ enabled }: { enabled: boolean }) {
  const query = useAdminOverview(enabled);

  function renderBody() {
    if (query.isError) {
      return <p className="px-5 py-5 text-seal text-sm">{String(query.error)}</p>;
    }
    if (!query.data) {
      return <p className="px-5 py-5 text-ink-faint text-sm">加载总览…</p>;
    }
    const { userCount, workspaceCount, documentCount, usage } = query.data;
    return (
      <div className="grid grid-cols-2 divide-x divide-y divide-hairline sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="用户" value={formatCount(userCount)} />
        <Tile label="工作区" value={formatCount(workspaceCount)} />
        <Tile label="文档" value={formatCount(documentCount)} />
        <Tile label="AI 调用" value={formatCount(usage.count)} />
        <Tile label="累计成本" value={formatCostMicros(usage.costMicros)} />
      </div>
    );
  }

  return (
    <AdminSection title="总览" description="全部工作区汇总,累计口径">
      {renderBody()}
    </AdminSection>
  );
}
