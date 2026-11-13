import { describe, expect, it } from "vitest";
import { spaceRoles, type SpaceMemberFacts } from "./space-roles";

const member = (id: string, over: Partial<SpaceMemberFacts> = {}): SpaceMemberFacts => ({
  id,
  displayName: id,
  color: "#000",
  avatarUrl: null,
  locale: "es",
  profileCreatedAt: "2026-10-01 10:00:00+00",
  joinedAt: null,
  managesPlan: false,
  ...over,
});

describe("spaceRoles", () => {
  it("makes whoever nobody invited the creator, even with a newer account", () => {
    const roles = spaceRoles([
      member("martin", { profileCreatedAt: "2026-09-01 10:00:00+00", joinedAt: "2026-10-04" }),
      member("ana", { profileCreatedAt: "2026-10-02 10:00:00+00" }),
    ]);
    expect(roles).toEqual({ creatorId: "ana", managerId: null, adminId: "ana" });
  });

  it("falls back to the older account for spaces that predate invites", () => {
    const roles = spaceRoles([
      member("b", { profileCreatedAt: "2026-05-02 10:00:00+00" }),
      member("a", { profileCreatedAt: "2026-05-01 10:00:00+00" }),
    ]);
    expect(roles.creatorId).toBe("a");
  });

  it("hands the space to whoever pays", () => {
    const roles = spaceRoles([
      member("ana"),
      member("martin", { joinedAt: "x", managesPlan: true }),
    ]);
    expect(roles).toEqual({ creatorId: "ana", managerId: "martin", adminId: "martin" });
  });

  it("is empty for an empty space", () => {
    expect(spaceRoles([])).toEqual({ creatorId: null, managerId: null, adminId: null });
  });
});
