import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../shared/types";
import { type MembershipLoader, requireAuth, type SessionGetter } from "./auth.middleware";

function appWith(getSession: SessionGetter, loadMemberships: MembershipLoader) {
  const app = new Hono<AppEnv>();
  app.use("/protected", requireAuth({ getSession, loadMemberships }));
  app.get("/protected", (c) => c.json({ user: c.get("user"), memberships: c.get("memberships") }));
  return app;
}

describe("requireAuth", () => {
  it("returns 401 when there is no session", async () => {
    const app = appWith(
      async () => null,
      async () => [],
    );
    const res = await app.request("/protected");
    expect(res.status).toBe(401);
  });

  it("passes through and populates context when authenticated", async () => {
    const app = appWith(
      async () => ({ user: { id: "u1", email: "a@b.com", name: "A" } }),
      async () => [{ workspaceId: "ws-1", role: "owner" }],
    );
    const res = await app.request("/protected");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      user: { id: string };
      memberships: unknown[];
    };
    expect(body.user.id).toBe("u1");
    expect(body.memberships).toHaveLength(1);
  });
});
