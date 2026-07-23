import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  findPublicProfile: vi.fn(),
  followByUsername: vi.fn(),
  isFollowing: vi.fn(),
  listFollowUsers: vi.fn(),
  listPublicProfileDocuments: vi.fn(),
  unfollowByUsername: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock("./profile.repository", () => repo);

import { followUser, getFollowStatus, unfollowUser } from "./profile.service";

beforeEach(() => vi.clearAllMocks());

describe("关注关系", () => {
  it("拒绝关注自己", async () => {
    repo.followByUsername.mockResolvedValue("self");
    await expect(followUser("u1", "dp_self000")).rejects.toMatchObject({
      code: "SELF_FOLLOW_NOT_ALLOWED",
      status: 400,
    });
  });

  it("重复取消关注仍返回成功", async () => {
    repo.unfollowByUsername.mockResolvedValue(true);
    await expect(unfollowUser("u1", "dp_user000")).resolves.toBeUndefined();
  });

  it("关注状态只对存在的公开用户返回", async () => {
    repo.findPublicProfile.mockResolvedValue({ username: "dp_user000" });
    repo.isFollowing.mockResolvedValue(true);
    await expect(getFollowStatus("u1", "dp_user000")).resolves.toEqual({ following: true });
  });
});
