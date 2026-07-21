import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

/**
 * 设置分区外壳:小标题 + 可选说明 + 一张 Card 承载内容。
 * 各分区(个人资料/用量/工作区/外观/登录设备/危险区)统一用它,保持版式一致。
 */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="font-display font-medium text-ink text-lg tracking-[-0.01em]">{title}</h2>
        {description ? <p className="text-ink-faint text-sm">{description}</p> : null}
      </div>
      <Card className="gap-0 py-0">{children}</Card>
    </section>
  );
}
