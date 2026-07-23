"use client";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useMe } from "@/features/account/use-me";
import {
  useFollowMutation,
  useFollowStatus,
  usePublicProfile,
} from "@/features/profiles/use-public-profile";
import { authClient } from "@/lib/auth-client";

export function ProfileView({ username }: { username: string }) {
  const { data: session } = authClient.useSession();
  const me = useMe(Boolean(session));
  const { profile, documents } = usePublicProfile(username);
  const status = useFollowStatus(username, Boolean(session));
  const follow = useFollowMutation(username);
  if (profile.isPending)
    return <main className="mx-auto max-w-3xl p-8 text-ink-faint">加载主页…</main>;
  if (profile.isError || !profile.data)
    return <main className="mx-auto max-w-3xl p-8 text-seal">个人主页不存在</main>;
  const p = profile.data;
  const own = me.data?.profile?.username === username;
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-6 py-14">
      <header className="flex flex-wrap items-start justify-between gap-5 border-hairline border-b pb-8">
        <div className="flex gap-4">
          <div className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-paper-sunken font-display text-2xl text-ink-soft">
            {p.image ? (
              <Image
                src={p.image}
                alt=""
                width={64}
                height={64}
                unoptimized
                className="size-full object-cover"
              />
            ) : (
              p.name.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h1 className="font-display text-3xl text-ink">{p.name}</h1>
            <p className="text-sm text-ink-faint">@{p.username}</p>
            {p.bio ? (
              <p className="mt-3 max-w-xl text-sm leading-7 text-ink-soft">{p.bio}</p>
            ) : null}
          </div>
        </div>
        {!own ? (
          session ? (
            <Button
              onClick={() => follow.mutate(Boolean(status.data?.following))}
              disabled={follow.isPending || status.isPending}
            >
              {status.data?.following ? "取消关注" : "关注"}
            </Button>
          ) : (
            <Button asChild>
              <Link href="/login">登录后关注</Link>
            </Button>
          )
        ) : null}
      </header>
      <div className="flex flex-wrap gap-5 text-sm text-ink-soft">
        <Link href={`/u/${username}/following`}>
          <strong className="text-ink">{p.followingCount}</strong> 关注
        </Link>
        <Link href={`/u/${username}/followers`}>
          <strong className="text-ink">{p.followerCount}</strong> 粉丝
        </Link>
        <span>{p.publicDocumentCount} 篇公开文档</span>
        {p.location ? <span>{p.location}</span> : null}
        {p.websiteUrl ? (
          <a href={p.websiteUrl} rel="noopener noreferrer" target="_blank" className="text-seal">
            个人网站
          </a>
        ) : null}
        {Object.entries(p.socialLinks).map(([platform, url]) => (
          <a
            key={platform}
            href={url}
            rel="noopener noreferrer"
            target="_blank"
            className="text-seal"
          >
            {platform}
          </a>
        ))}
      </div>
      <section>
        <h2 className="mb-4 font-display text-xl">公开文档</h2>
        {documents.isPending ? (
          <p className="text-sm text-ink-faint">加载中…</p>
        ) : documents.data?.length ? (
          <Card className="gap-0 overflow-hidden py-0">
            <ul className="divide-y divide-hairline">
              {documents.data.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/p/${d.id}`}
                    className="flex justify-between px-4 py-4 focus-visible:outline-2 outline-ring [@media(hover:hover)]:hover:bg-paper-sunken"
                  >
                    <span>{d.title}</span>
                    <span className="text-xs text-ink-faint">
                      {d.pageCount ? `${d.pageCount} 页` : "PDF"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <p className="text-sm text-ink-faint">暂无公开文档。</p>
        )}
      </section>
    </main>
  );
}
