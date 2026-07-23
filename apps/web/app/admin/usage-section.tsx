"use client";

import { useState } from "react";
import { formatCount } from "@/features/account/format";
import { formatCostMicros } from "@/features/admin/format";
import type { UsageByDay } from "@/features/admin/types";
import { useAdminUsage } from "@/features/admin/use-admin";
import { cn } from "@/lib/utils";
import { AdminSection } from "./admin-section";

const WINDOWS = [7, 30, 90] as const;

/** 按天成本柱状图(墨水纸:朱印色柱 + 纸凹底轨)。单序列,无需配色体系。 */
function CostBars({ byDay }: { byDay: UsageByDay[] }) {
  if (byDay.length === 0) {
    return <p className="px-5 py-8 text-center text-ink-faint text-sm">窗口内暂无用量</p>;
  }
  const max = Math.max(...byDay.map((d) => d.costMicros), 1);
  return (
    <div className="flex h-32 items-end gap-0.5 px-5 pt-5" aria-hidden="true">
      {byDay.map((d) => (
        <div
          key={d.day}
          className="flex flex-1 items-end self-stretch rounded-t-sm bg-paper-sunken"
          title={`${d.day} · ${formatCostMicros(d.costMicros)}`}
        >
          <div
            className="w-full rounded-t-sm bg-seal/70"
            style={{ height: `${Math.max(2, (d.costMicros / max) * 100)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

/** 用量与成本(GET /admin/usage):窗口切换 + 按天柱状图 + 按模型明细。 */
export function UsageSection({ enabled }: { enabled: boolean }) {
  const [days, setDays] = useState<number>(30);
  const query = useAdminUsage(enabled, days);

  const selector = (
    <fieldset className="flex items-center gap-1">
      <legend className="sr-only">统计窗口</legend>
      {WINDOWS.map((w) => (
        <button
          key={w}
          type="button"
          onClick={() => setDays(w)}
          aria-pressed={days === w}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            days === w
              ? "bg-accent font-medium text-ink"
              : "text-ink-soft [@media(hover:hover)]:hover:bg-accent [@media(hover:hover)]:hover:text-ink",
          )}
        >
          {w} 天
        </button>
      ))}
    </fieldset>
  );

  function renderBody() {
    if (query.isError) {
      return <p className="px-5 py-5 text-seal text-sm">{String(query.error)}</p>;
    }
    if (!query.data) {
      return <p className="px-5 py-5 text-ink-faint text-sm">加载用量…</p>;
    }
    const { byDay, byModel, totals } = query.data;
    return (
      <div className="divide-y divide-hairline">
        <div className="flex flex-wrap gap-x-8 gap-y-2 px-5 py-4 text-sm">
          <span className="text-ink-soft">
            成本{" "}
            <span className="text-ink tabular-nums">{formatCostMicros(totals.costMicros)}</span>
          </span>
          <span className="text-ink-soft">
            调用 <span className="text-ink tabular-nums">{formatCount(totals.count)}</span>
          </span>
          <span className="text-ink-soft">
            输入 Token{" "}
            <span className="text-ink tabular-nums">{formatCount(totals.inputTokens)}</span>
          </span>
          <span className="text-ink-soft">
            输出 Token{" "}
            <span className="text-ink tabular-nums">{formatCount(totals.outputTokens)}</span>
          </span>
        </div>
        <div className="pb-5">
          <CostBars byDay={byDay} />
        </div>
        {byModel.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-ink-faint text-xs">
                  <th className="px-5 py-2 text-left font-normal">模型</th>
                  <th className="px-5 py-2 text-right font-normal">调用</th>
                  <th className="px-5 py-2 text-right font-normal">输入</th>
                  <th className="px-5 py-2 text-right font-normal">输出</th>
                  <th className="px-5 py-2 text-right font-normal">成本</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {byModel.map((m) => (
                  <tr key={m.model}>
                    <td className="px-5 py-2 text-ink">{m.model}</td>
                    <td className="px-5 py-2 text-right text-ink-soft tabular-nums">
                      {formatCount(m.count)}
                    </td>
                    <td className="px-5 py-2 text-right text-ink-soft tabular-nums">
                      {formatCount(m.inputTokens)}
                    </td>
                    <td className="px-5 py-2 text-right text-ink-soft tabular-nums">
                      {formatCount(m.outputTokens)}
                    </td>
                    <td className="px-5 py-2 text-right text-ink tabular-nums">
                      {formatCostMicros(m.costMicros)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <AdminSection title="用量与成本" description="按天成本趋势与按模型明细" action={selector}>
      {renderBody()}
    </AdminSection>
  );
}
