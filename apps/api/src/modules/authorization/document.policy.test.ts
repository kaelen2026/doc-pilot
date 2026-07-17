import { describe, expect, it } from "vitest";
import { canAccessWorkspace, isWorkspaceOwner } from "./document.policy";

const memberships = [{ workspaceId: "ws-1", role: "owner" }];

describe("document.policy", () => {
  it("grants access to a member workspace", () => {
    expect(canAccessWorkspace(memberships, "ws-1")).toBe(true);
  });

  it("denies access to a non-member workspace", () => {
    expect(canAccessWorkspace(memberships, "ws-2")).toBe(false);
  });

  it("detects the owner role", () => {
    expect(isWorkspaceOwner(memberships, "ws-1")).toBe(true);
    expect(isWorkspaceOwner(memberships, "ws-2")).toBe(false);
  });
});
