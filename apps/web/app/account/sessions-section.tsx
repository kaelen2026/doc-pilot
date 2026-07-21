"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deviceLabel } from "@/features/account/format";
import {
  useRevokeOtherSessions,
  useRevokeSession,
  useSessions,
} from "@/features/account/use-sessions";
import { authClient } from "@/lib/auth-client";
import { SettingsSection } from "./settings-section";

function loginedAt(createdAt: string): string {
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? "" : `登录于 ${d.toLocaleDateString("zh-CN")}`;
}

/** 登录设备:活跃会话列表(标本机)、逐个退出、一键登出其它设备。 */
export function SessionsSection({ enabled }: { enabled: boolean }) {
  const { data: session } = authClient.useSession();
  const currentToken = session?.session.token;
  const sessionsQuery = useSessions(enabled);
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();

  const sessions = sessionsQuery.data ?? [];
  const hasOthers = sessions.some((s) => s.token !== currentToken);

  function renderBody() {
    if (sessionsQuery.isError) {
      return <p className="px-5 py-5 text-seal text-sm">{String(sessionsQuery.error)}</p>;
    }
    if (!sessionsQuery.data) {
      return <p className="px-5 py-5 text-ink-faint text-sm">加载登录设备…</p>;
    }
    return (
      <ul className="divide-y divide-hairline">
        {sessions.map((s) => {
          const isCurrent = s.token === currentToken;
          return (
            <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-ink text-sm">{deviceLabel(s.userAgent)}</span>
                  {isCurrent ? <Badge>本机</Badge> : null}
                </div>
                {loginedAt(s.createdAt) ? (
                  <p className="mt-0.5 text-ink-faint text-xs tabular-nums">
                    {loginedAt(s.createdAt)}
                  </p>
                ) : null}
              </div>
              {isCurrent ? null : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => revoke.mutate(s.token)}
                  disabled={revoke.isPending}
                  className="text-seal [@media(hover:hover)]:hover:text-seal-deep"
                >
                  退出
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <SettingsSection title="登录设备" description="你的账户当前在这些设备上保持登录">
      {renderBody()}
      {hasOthers ? (
        <div className="border-hairline border-t px-5 py-4">
          <Button
            size="sm"
            variant="outline"
            onClick={() => revokeOthers.mutate()}
            disabled={revokeOthers.isPending}
          >
            {revokeOthers.isPending ? "处理中…" : "登出其它所有设备"}
          </Button>
          {revokeOthers.isError ? (
            <span className="ml-3 text-seal text-xs">{String(revokeOthers.error)}</span>
          ) : null}
        </div>
      ) : null}
    </SettingsSection>
  );
}
