import { describe, expect, it } from "vitest";
import {
  avatarPath,
  avatarPathFromSrc,
  avatarRejectionReason,
  avatarSrc,
  isAllowedAvatarType,
  isValidAvatarPath,
  MAX_AVATAR_BYTES,
} from "./avatars";

const USER = "6f1a0a5e-6a2a-4c1e-9b1e-1d2c3b4a5e6f";
const OTHER = "11111111-2222-4333-8444-555555555555";
const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("avatarPath", () => {
  it("puts the file under its owner with a fresh id and the extension", () => {
    expect(avatarPath(USER, "Selfie.JPG", UUID)).toBe(`avatars/${USER}/${UUID}.jpg`);
  });
  it("drops the extension when the name has none", () => {
    expect(avatarPath(USER, "foto", UUID)).toBe(`avatars/${USER}/${UUID}`);
  });
});

describe("isValidAvatarPath", () => {
  it("accepts a path this app would generate", () => {
    expect(isValidAvatarPath(avatarPath(USER, "a.png", UUID), USER)).toBe(true);
    expect(isValidAvatarPath(`avatars/${USER}/${UUID}`, USER)).toBe(true);
  });
  it("rejects someone else's folder", () => {
    expect(isValidAvatarPath(`avatars/${OTHER}/${UUID}.jpg`, USER)).toBe(false);
  });
  it("rejects climbing out or nesting", () => {
    expect(isValidAvatarPath(`avatars/${USER}/../${OTHER}/${UUID}.jpg`, USER)).toBe(false);
    expect(isValidAvatarPath(`avatars/${USER}/x/${UUID}.jpg`, USER)).toBe(false);
  });
  it("rejects names that aren't a uuid", () => {
    expect(isValidAvatarPath(`avatars/${USER}/me.jpg`, USER)).toBe(false);
  });
  it("rejects the attachments folder and an empty user", () => {
    expect(isValidAvatarPath(`attachments/${USER}/${UUID}.jpg`, USER)).toBe(false);
    expect(isValidAvatarPath(`avatars//${UUID}.jpg`, "")).toBe(false);
  });
});

describe("avatarSrc / avatarPathFromSrc", () => {
  const path = avatarPath(USER, "a.webp", UUID);

  it("round-trips a stored path", () => {
    const src = avatarSrc(USER, path);
    expect(src).toBe(`/api/avatars/${USER}?v=${UUID}.webp`);
    expect(avatarPathFromSrc(src, USER)).toBe(path);
  });
  it("ignores Google photos, old links and empty values", () => {
    expect(avatarPathFromSrc("https://lh3.googleusercontent.com/a/abc=s96-c", USER)).toBeNull();
    expect(avatarPathFromSrc("https://x.supabase.co/storage/v1/avatars/a.jpg", USER)).toBeNull();
    expect(avatarPathFromSrc(null, USER)).toBeNull();
    expect(avatarPathFromSrc("", USER)).toBeNull();
  });
  it("only resolves the src for the person it belongs to", () => {
    expect(avatarPathFromSrc(avatarSrc(USER, path), OTHER)).toBeNull();
  });
  it("rejects a v that would climb into another folder", () => {
    const sneaky = `/api/avatars/${USER}?v=${encodeURIComponent(`../${OTHER}/${UUID}.jpg`)}`;
    expect(avatarPathFromSrc(sneaky, USER)).toBeNull();
  });
  it("rejects an absolute URL on another host", () => {
    expect(
      avatarPathFromSrc(`https://evil.com/api/avatars/${USER}?v=${UUID}.jpg`, USER),
    ).toBeNull();
  });
});

describe("isAllowedAvatarType / avatarRejectionReason", () => {
  it("allows photos only", () => {
    expect(isAllowedAvatarType("image/jpeg")).toBe(true);
    expect(isAllowedAvatarType("image/heic")).toBe(true);
    expect(isAllowedAvatarType("image/svg+xml")).toBe(false);
    expect(isAllowedAvatarType("application/pdf")).toBe(false);
  });
  it("explains why a file can't be used", () => {
    expect(avatarRejectionReason({ type: "image/png", size: 1000 })).toBeNull();
    expect(avatarRejectionReason({ type: "application/pdf", size: 1000 })).toMatch(/imagen/);
    expect(avatarRejectionReason({ type: "image/png", size: MAX_AVATAR_BYTES + 1 })).toMatch(
      /pesada/,
    );
    expect(avatarRejectionReason({ type: "image/png", size: 0 })).toMatch(/vacía/);
  });
});
