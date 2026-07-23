"use client";

import { ACCOUNT_DELETION_COOLDOWN_DAYS } from "@doc-pilot/contracts";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRequestAccountDeletion } from "@/features/account/use-account-deletion";
import { SettingsSection } from "./settings-section";

/**
 * 危险区:注销账户。二次确认防误触;确认后进入冷静期(账户冻结、期间可撤销),到期由
 * worker 硬删除。请求成功即被重定向到「恢复账户」页(见 use-account-deletion)。
 */
export function DangerSection() {
  const [confirming, setConfirming] = useState(false);
  const request = useRequestAccountDeletion();

  return (
    <SettingsSection title="危险区">
      <div className="flex items-center justify-between gap-4 px-5 py-5">
        <div className="min-w-0">
          <span className="text-ink text-sm">注销账户</span>
          <p className="mt-1 text-ink-faint text-sm leading-[1.6]">
            注销后有 {ACCOUNT_DELETION_COOLDOWN_DAYS} 天冷静期,期间账户冻结但可随时撤销;
            冷静期过后将永久删除你的账户及全部工作区、文档与对话,不可恢复。
          </p>
          {request.isError ? (
            <p className="mt-1 text-seal text-sm">{String(request.error)}</p>
          ) : null}
        </div>
        {confirming ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={request.isPending}
            >
              取消
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => request.mutate()}
              disabled={request.isPending}
            >
              {request.isPending ? "提交中…" : "确认注销"}
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="destructive"
            className="shrink-0"
            onClick={() => setConfirming(true)}
          >
            注销账户
          </Button>
        )}
      </div>
    </SettingsSection>
  );
}
