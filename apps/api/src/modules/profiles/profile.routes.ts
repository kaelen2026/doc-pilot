import { Hono } from "hono";
import type { AppEnv } from "../../shared/types";
import { parseProfileUpdate } from "./profile.schema";
import {
  followUser,
  getFollowStatus,
  getFollowUsers,
  getPublicDocuments,
  getPublicProfile,
  saveProfile,
  unfollowUser,
} from "./profile.service";

export function createPublicProfileRoutes() {
  return new Hono<AppEnv>()
    .get("/:username", async (c) =>
      c.json({ profile: await getPublicProfile(c.req.param("username")) }),
    )
    .get("/:username/documents", async (c) =>
      c.json({ documents: await getPublicDocuments(c.req.param("username")) }),
    )
    .get("/:username/followers", async (c) =>
      c.json({ users: await getFollowUsers(c.req.param("username"), "followers") }),
    )
    .get("/:username/following", async (c) =>
      c.json({ users: await getFollowUsers(c.req.param("username"), "following") }),
    );
}

export function createProfileRoutes() {
  return new Hono<AppEnv>()
    .patch("/me/profile", async (c) =>
      c.json({
        profile: await saveProfile(
          c.get("user").id,
          parseProfileUpdate(await c.req.json().catch(() => null)),
        ),
      }),
    )
    .get("/me/follows/:username", async (c) =>
      c.json(await getFollowStatus(c.get("user").id, c.req.param("username"))),
    )
    .put("/users/:username/follow", async (c) => {
      await followUser(c.get("user").id, c.req.param("username"));
      return c.json({ following: true });
    })
    .delete("/users/:username/follow", async (c) => {
      await unfollowUser(c.get("user").id, c.req.param("username"));
      return c.json({ following: false });
    });
}
