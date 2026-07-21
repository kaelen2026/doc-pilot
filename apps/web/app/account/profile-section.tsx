"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MeUser } from "@/features/account/types";
import { useUpdateName } from "@/features/account/use-profile";
import { SettingsSection } from "./settings-section";

/** 姓名/邮箱 → 单字符首字母头像文案(与头部菜单口径一致)。 */
function initial(nameOrEmail: string): string {
  const trimmed = nameOrEmail.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

function joinedLabel(createdAt: string): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月加入`;
}

/** 个人资料:头像 + 昵称(行内编辑)+ 邮箱(只读)+ 加入时间。 */
export function ProfileSection({ user }: { user: MeUser }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name ?? "");
  const update = useUpdateName();

  const displayName = user.name?.trim() || user.email;

  function startEdit() {
    setName(user.name ?? "");
    setEditing(true);
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === user.name) {
      setEditing(false);
      return;
    }
    update.mutate(trimmed, { onSuccess: () => setEditing(false) });
  }

  return (
    <SettingsSection title="个人资料">
      <div className="flex items-center gap-4 px-5 py-5">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-paper-sunken font-display font-medium text-ink-soft text-xl">
          {initial(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="昵称"
                maxLength={64}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    save();
                  } else if (e.key === "Escape") {
                    setEditing(false);
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={save} disabled={update.isPending}>
                  {update.isPending ? "保存中…" : "保存"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  取消
                </Button>
                {update.isError ? (
                  <span className="text-seal text-xs">{String(update.error)}</span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{displayName}</p>
                <p className="truncate text-ink-faint text-sm">{user.email}</p>
                {joinedLabel(user.createdAt) ? (
                  <p className="mt-0.5 text-ink-faint text-xs">{joinedLabel(user.createdAt)}</p>
                ) : null}
              </div>
              <Button size="sm" variant="outline" onClick={startEdit}>
                编辑
              </Button>
            </div>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
