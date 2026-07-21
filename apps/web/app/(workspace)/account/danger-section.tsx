import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SettingsSection } from "./settings-section";

/**
 * 危险区:注销账户。
 * 占位——账户注销需异步销毁工作区/文档/存储的全部数据(走删除管线 + Outbox 不变量),
 * 属独立工程,尚未落地;此处先给出入口与说明,按钮禁用,避免糊一个会产生孤儿数据的危险版本。
 */
export function DangerSection() {
  return (
    <SettingsSection title="危险区">
      <div className="flex items-center justify-between gap-4 px-5 py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-ink text-sm">注销账户</span>
            <Badge>即将推出</Badge>
          </div>
          <p className="mt-1 text-ink-faint text-sm leading-[1.6]">
            将永久删除你的账户及全部工作区、文档与对话,操作不可撤销。该功能仍在开发中。
          </p>
        </div>
        <Button size="sm" variant="destructive" disabled>
          注销账户
        </Button>
      </div>
    </SettingsSection>
  );
}
