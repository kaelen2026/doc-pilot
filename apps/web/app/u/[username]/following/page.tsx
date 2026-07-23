import { PublicTopBar } from "@/features/shell/public-top-bar";
import { FollowListView } from "../follow-list-view";
export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return (
    <>
      <PublicTopBar />
      <FollowListView username={username} direction="following" />
    </>
  );
}
