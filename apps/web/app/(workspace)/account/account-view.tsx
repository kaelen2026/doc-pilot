"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMe } from "@/features/account/use-me";
import { authClient } from "@/lib/auth-client";
import { AppearanceSection } from "./appearance-section";
import { DangerSection } from "./danger-section";
import { ProfileSection } from "./profile-section";
import { SessionsSection } from "./sessions-section";
import { UsageSection } from "./usage-section";
import { WorkspacesSection } from "./workspaces-section";

const rise = "animate-[rise_0.5s_cubic-bezier(0.2,0,0,1)_both]";

/**
 * 用户中心编排壳:会话/状态路由用早返回收敛在 renderBody 里(见 frontend.md「状态与渲染」),
 * 数据分区各自持有查询(用量/登录设备),个人资料与工作区吃 useMe 的结果。
 */
export function AccountView() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const enabled = !!session;
  const meQuery = useMe(enabled);
  const router = useRouter();

  // 未登录访客不该看到设置页:会话解析完成且确无登录态时回登录页。
  useEffect(() => {
    if (!sessionPending && !session) {
      router.replace("/login");
    }
  }, [sessionPending, session, router]);

  function renderBody() {
    if (sessionPending || !session) {
      return <p className="text-ink-faint text-sm">加载中…</p>;
    }
    if (meQuery.isError) {
      return <p className="text-seal text-sm">{String(meQuery.error)}</p>;
    }
    if (!meQuery.data) {
      return <p className="text-ink-faint text-sm">加载账户信息…</p>;
    }
    const { user, workspaces } = meQuery.data;
    return (
      <div className="space-y-10">
        <ProfileSection user={user} />
        <UsageSection enabled={enabled} />
        <WorkspacesSection workspaces={workspaces} />
        <AppearanceSection />
        <SessionsSection enabled={enabled} />
        <DangerSection />
      </div>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <header className={rise}>
        <h1 className="font-display font-medium text-3xl tracking-[-0.018em]">设置</h1>
      </header>

      <section className={rise} style={{ animationDelay: "100ms" }}>
        {renderBody()}
      </section>
    </main>
  );
}
