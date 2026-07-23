"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Me, MeUser } from "@/features/account/types";
import { useUpdateProfile } from "@/features/account/use-profile";
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
export function ProfileSection({ user, profile }: { user: MeUser; profile: Me["profile"] }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [image, setImage] = useState(user.image ?? "");
  const [location, setLocation] = useState(profile?.location ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(profile?.websiteUrl ?? "");
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(
    profile?.socialLinks ?? {},
  );
  const update = useUpdateProfile();

  const displayName = user.name?.trim() || user.email;

  function startEdit() {
    setName(user.name ?? "");
    setBio(profile?.bio ?? "");
    setImage(user.image ?? "");
    setLocation(profile?.location ?? "");
    setWebsiteUrl(profile?.websiteUrl ?? "");
    setSocialLinks(profile?.socialLinks ?? {});
    setEditing(true);
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setEditing(false);
      return;
    }
    update.mutate(
      {
        name: trimmed,
        image: image.trim() || null,
        bio: bio.trim() || null,
        location: location.trim() || null,
        websiteUrl: websiteUrl.trim() || null,
        socialLinks: Object.fromEntries(
          Object.entries(socialLinks).filter(([, value]) => value.trim().length > 0),
        ),
      },
      { onSuccess: () => setEditing(false) },
    );
  }

  return (
    <SettingsSection title="个人资料">
      <div className="flex items-center gap-4 px-5 py-5">
        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-paper-sunken font-display font-medium text-ink-soft text-xl">
          {user.image ? (
            <Image
              src={user.image}
              alt=""
              width={48}
              height={48}
              unoptimized
              className="size-full object-cover"
            />
          ) : (
            initial(displayName)
          )}
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
              <Input
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                aria-label="简介"
                placeholder="简介"
                maxLength={300}
              />
              <Input
                value={image}
                onChange={(e) => setImage(e.target.value)}
                aria-label="头像链接"
                placeholder="头像 HTTPS 链接"
                maxLength={500}
              />
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                aria-label="地区"
                placeholder="地区"
                maxLength={80}
              />
              <Input
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                aria-label="个人网站"
                placeholder="https://example.com"
                maxLength={500}
              />
              {(["github", "x", "linkedin", "weibo", "bilibili"] as const).map((platform) => (
                <Input
                  key={platform}
                  value={socialLinks[platform] ?? ""}
                  onChange={(e) =>
                    setSocialLinks((current) => ({ ...current, [platform]: e.target.value }))
                  }
                  aria-label={`${platform} 链接`}
                  placeholder={`${platform} · https://`}
                  maxLength={500}
                />
              ))}
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
                {profile ? (
                  <p className="truncate text-ink-faint text-xs">公开主页：/u/{profile.username}</p>
                ) : null}
                {profile?.bio ? <p className="mt-1 text-sm text-ink-soft">{profile.bio}</p> : null}
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
