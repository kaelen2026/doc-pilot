import { FollowListView } from "../follow-list-view";
export default async function Page({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <FollowListView username={username} direction="followers" />;
}
