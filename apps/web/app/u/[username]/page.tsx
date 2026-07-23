import type { Metadata } from "next";
import { PublicTopBar } from "@/features/shell/public-top-bar";
import { ProfileView } from "./profile-view";
export const metadata: Metadata = { title: "个人主页" };
export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return (
    <>
      <PublicTopBar />
      <ProfileView username={username} />
    </>
  );
}
