import type { Metadata } from "next";
import { ProfileView } from "./profile-view";
export const metadata: Metadata = { title: "个人主页" };
export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <ProfileView username={username} />;
}
