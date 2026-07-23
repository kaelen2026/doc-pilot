"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useCancelAccountDeletion } from "@/features/account/use-account-deletion";
import { useMe } from "@/features/account/use-me";
import { useSignOut } from "@/features/account/use-sign-out";
import { authClient } from "@/lib/auth-client";

const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("zh-CN");
}

/**
 * 恢复账户页(注销冷静期的落地页)。刻意放在 (workspace) route group 之外,不经工作台
 * layout 的冻结重定向,故冻结用户被踢到这里不会自我循环。仅呈现:到期时间 + 撤销 + 退出。
 */
export default function RestoreAccountPage() {
  const { data: session, isPending } = authClient.useSession();
  const meQuery = useMe(!!session);
  const cancel = useCancelAccountDeletion();
  const signOut = useSignOut();
  const router = useRouter();

  const scheduledAt = meQuery.data?.deletionScheduledAt ?? null;

  // 未登录 → 登录页;已登录但并未处于冷静期(已撤销 / 直接访问)→ 回工作台。
  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
      return;
    }
    if (meQuery.data && !meQuery.data.deletionScheduledAt) {
      router.replace("/documents");
    }
  }, [isPending, session, meQuery.data, router]);

  function renderBody() {
    if (isPending || !session || !meQuery.data) {
      return <p className="text-ink-faint text-sm">加载中…</p>;
    }
    if (!scheduledAt) {
      return <p className="text-ink-faint text-sm">正在返回…</p>;
    }
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="font-display font-medium text-ink text-xl tracking-[-0.01em]">
            账户待注销
          </h1>
          <p className="text-ink-soft text-sm leading-[1.7]">
            你的账户已进入注销冷静期,将于{" "}
            <span className="text-ink tabular-nums">{formatWhen(scheduledAt)}</span>{" "}
            永久删除,届时你的全部工作区、文档与对话都会被清除,不可恢复。
          </p>
          <p className="text-ink-faint text-sm leading-[1.7]">
            改变主意了?现在撤销即可立即恢复账户。
          </p>
        </div>
        {cancel.isError ? <p className="text-seal text-sm">{String(cancel.error)}</p> : null}
        <div className="flex items-center gap-3">
          <Button onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            {cancel.isPending ? "恢复中…" : "撤销注销,恢复账户"}
          </Button>
          <Button variant="ghost" onClick={() => signOut()} disabled={cancel.isPending}>
            退出登录
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <div className={rise}>{renderBody()}</div>
    </main>
  );
}
