"use client";

import { Progress } from "@/components/ui/progress";
import { formatBytes, formatCount, usagePercent } from "@/features/account/format";
import type { Usage } from "@/features/account/types";
import { useUsage } from "@/features/account/use-usage";
import { SettingsSection } from "./settings-section";

type DimensionKey = keyof Usage;

// 四个配额维度的展示配置:存储用字节格式化,其余用千位计数。
const DIMENSIONS: Array<{ key: DimensionKey; label: string; format: (n: number) => string }> = [
  { key: "storageBytes", label: "存储空间", format: formatBytes },
  { key: "documentCount", label: "文档数量", format: formatCount },
  { key: "monthlyAiTokens", label: "本月 AI Token", format: formatCount },
  { key: "monthlyQuestions", label: "本月提问", format: formatCount },
];

/** 用量看板:四个配额维度的 used/limit + 进度条(GET /me/usage)。 */
export function UsageSection({ enabled }: { enabled: boolean }) {
  const usageQuery = useUsage(enabled);

  function renderBody() {
    if (usageQuery.isError) {
      return <p className="px-5 py-5 text-seal text-sm">{String(usageQuery.error)}</p>;
    }
    if (!usageQuery.data) {
      return <p className="px-5 py-5 text-ink-faint text-sm">加载用量…</p>;
    }
    const usage = usageQuery.data;
    return (
      <ul className="divide-y divide-hairline">
        {DIMENSIONS.map(({ key, label, format }) => {
          const { used, limit } = usage[key];
          const pct = usagePercent(used, limit);
          return (
            <li key={key} className="flex flex-col gap-2 px-5 py-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-ink text-sm">{label}</span>
                <span className="text-ink-faint text-xs tabular-nums">
                  {format(used)} / {format(limit)}
                </span>
              </div>
              <Progress value={pct} />
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <SettingsSection title="用量" description="当前工作区的配额用量,存储与月度额度按此计费口径统计">
      {renderBody()}
    </SettingsSection>
  );
}
