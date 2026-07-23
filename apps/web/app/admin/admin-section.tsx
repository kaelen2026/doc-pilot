import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

/** 后台分区外壳:小标题 + 可选说明 + 可选右上角操作 + 一张 Card 承载内容。 */
export function AdminSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display font-medium text-ink text-lg tracking-[-0.01em]">{title}</h2>
          {description ? <p className="text-ink-faint text-sm">{description}</p> : null}
        </div>
        {action}
      </div>
      <Card className="gap-0 py-0">{children}</Card>
    </section>
  );
}
