"use client";
import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { fetchFollowUsers } from "@/features/profiles/api";
export function FollowListView({
  username,
  direction,
}: {
  username: string;
  direction: "followers" | "following";
}) {
  const query = useQuery({
    queryKey: ["follow-users", username, direction],
    queryFn: () => fetchFollowUsers(username, direction),
  });
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-14">
      <Link href={`/u/${username}`} className="text-sm text-seal">
        ← 返回主页
      </Link>
      <h1 className="my-6 font-display text-3xl">{direction === "followers" ? "粉丝" : "关注"}</h1>
      {query.isPending ? (
        <p className="text-ink-faint">加载中…</p>
      ) : query.isError ? (
        <p className="text-seal">无法加载列表</p>
      ) : (
        <ul className="divide-y divide-hairline border-hairline border-y">
          {query.data?.map((u) => (
            <li key={u.username}>
              <Link
                href={`/u/${u.username}`}
                className="flex gap-3 px-3 py-4 [@media(hover:hover)]:hover:bg-paper-sunken"
              >
                <div className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-paper-sunken">
                  {u.image ? (
                    <Image
                      src={u.image}
                      alt=""
                      width={40}
                      height={40}
                      unoptimized
                      className="size-full object-cover"
                    />
                  ) : (
                    u.name.charAt(0)
                  )}
                </div>
                <div>
                  <p className="text-sm text-ink">{u.name}</p>
                  <p className="text-xs text-ink-faint">@{u.username}</p>
                  {u.bio ? <p className="mt-1 text-sm text-ink-soft">{u.bio}</p> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
