import { describe, expect, it } from "vitest";
import { inviteLink, invitePath, parseInviteToken } from "./invite-link";

describe("invite links", () => {
  // Regression: the copied link was /login?invite=…, which nothing read, so an
  // existing account opening it just signed in and never saw the invite.
  it("points at the accept page and carries the token through a login redirect", () => {
    expect(inviteLink("https://app.test/", "abcDEF123_-xyz789")).toBe(
      "https://app.test/invite/abcDEF123_-xyz789?invite=abcDEF123_-xyz789",
    );
    expect(invitePath("abcDEF123_-xyz789")).toBe(
      "/invite/abcDEF123_-xyz789?invite=abcDEF123_-xyz789",
    );
  });

  it("only accepts what an invite token can look like", () => {
    expect(parseInviteToken("abcDEF123_-xyz789")).toBe("abcDEF123_-xyz789");
    expect(parseInviteToken("//evil.example")).toBeNull();
    expect(parseInviteToken("short")).toBeNull();
    expect(parseInviteToken(["a"])).toBeNull();
    expect(parseInviteToken(undefined)).toBeNull();
  });
});
