import { describe, expect, it } from "vitest";
import { securityHeaders } from "./security-headers";

const get = (key: string) => securityHeaders.find((h) => h.key === key)?.value;
const csp = () => get("Content-Security-Policy-Report-Only") ?? "";
const directive = (name: string) =>
  csp()
    .split("; ")
    .find((d) => d.startsWith(`${name} `)) ?? "";

describe("securityHeaders", () => {
  it("sets the headers that cannot break a page", () => {
    expect(get("X-Content-Type-Options")).toBe("nosniff");
    expect(get("X-Frame-Options")).toBe("DENY");
    expect(get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(get("Strict-Transport-Security")).toContain("max-age=");
  });

  it("denies the permissions the app never asks for", () => {
    const p = get("Permissions-Policy") ?? "";
    for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
      expect(p).toContain(`${feature}=()`);
    }
  });

  /**
   * The point of this one: enforcing before the policy has been validated
   * against a real browser session breaks the app silently. Flipping the key is
   * a deliberate act, so it should fail a test that says so.
   */
  it("ships the CSP in Report-Only, not enforcing", () => {
    expect(get("Content-Security-Policy-Report-Only")).toBeTruthy();
    expect(get("Content-Security-Policy")).toBeUndefined();
  });

  it("allows every external origin the app actually uses", () => {
    expect(directive("script-src")).toContain("https://sdk.scdn.co");
    expect(directive("frame-src")).toContain("https://sdk.scdn.co");
    expect(directive("connect-src")).toContain("https://api.spotify.com");
    expect(directive("connect-src")).toContain("wss://*.spotify.com");
    expect(directive("img-src")).toContain("https://*.googleusercontent.com");
    expect(directive("img-src")).toContain("https://*.blob.vercel-storage.com");
    expect(directive("img-src")).toContain("https://*.scdn.co");
  });

  it("locks down the directives that have no legitimate use here", () => {
    expect(csp()).toContain("object-src 'none'");
    expect(csp()).toContain("frame-ancestors 'none'");
    expect(csp()).toContain("base-uri 'self'");
    expect(csp()).toContain("form-action 'self'");
  });

  it("has a default-src, so an unlisted directive falls back closed", () => {
    expect(directive("default-src")).toBe("default-src 'self'");
  });
});
