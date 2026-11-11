import { describe, expect, it } from "vitest";
import { adminEmails, isAdminEmail } from "./admin";

describe("isAdminEmail", () => {
  it("lets in an email on the list, whatever its case and spacing", () => {
    const list = " ana@example.com, Bo@Example.com ";
    expect(isAdminEmail("ana@example.com", list)).toBe(true);
    expect(isAdminEmail("bo@example.com", list)).toBe(true);
    expect(isAdminEmail("BO@EXAMPLE.COM", list)).toBe(true);
  });

  it("keeps out everyone else", () => {
    expect(isAdminEmail("eve@example.com", "ana@example.com")).toBe(false);
    // A prefix or a domain is not a match.
    expect(isAdminEmail("ana@example.co", "ana@example.com")).toBe(false);
    expect(isAdminEmail("example.com", "ana@example.com")).toBe(false);
  });

  it("fails closed when the list is unset, empty or only commas", () => {
    expect(isAdminEmail("ana@example.com", undefined)).toBe(false);
    expect(isAdminEmail("ana@example.com", "")).toBe(false);
    expect(isAdminEmail("ana@example.com", " , ,")).toBe(false);
    expect(adminEmails(" , ,").size).toBe(0);
  });

  it("never matches a missing email, even against an empty entry", () => {
    expect(isAdminEmail(null, "ana@example.com")).toBe(false);
    expect(isAdminEmail("", ",")).toBe(false);
    expect(isAdminEmail("   ", "ana@example.com,")).toBe(false);
  });
});
