import { describe, expect, it } from "vitest";
import { cleanEmailText, inboundAddress, isAuthorizedInbound, userFromAddress } from "./inbound";

const secret = "s3cret";
const domain = "in.example.com";
const user = "3f2b6c1e-9a4d-4e7b-8c21-5d6e7f8a9b0c";

describe("inbound address", () => {
  it("round-trips a user id through the address", () => {
    const addr = inboundAddress(user, secret, domain);
    expect(addr).toMatch(/^backlog\+[0-9a-f]{32}\.[0-9a-f]{12}@in\.example\.com$/);
    expect(addr.split("@")[0].length).toBeLessThanOrEqual(64);
    expect(userFromAddress(addr, secret, domain)).toBe(user);
  });

  it("accepts display-name form and any case", () => {
    const addr = inboundAddress(user, secret, domain).toUpperCase();
    expect(userFromAddress(`Mi backlog <${addr}>`, secret, domain)).toBe(user);
  });

  it("rejects a forged signature, another secret, or another domain", () => {
    const addr = inboundAddress(user, secret, domain);
    const forged = addr.replace(/\.[0-9a-f]{12}@/, ".000000000000@");
    expect(userFromAddress(forged, secret, domain)).toBeNull();
    expect(userFromAddress(addr, "other", domain)).toBeNull();
    expect(userFromAddress(addr.replace(domain, "evil.com"), secret, domain)).toBeNull();
  });

  it("rejects addresses that aren't ours at all", () => {
    expect(userFromAddress("hola@in.example.com", secret, domain)).toBeNull();
    expect(userFromAddress("backlog+zz.abc@in.example.com", secret, domain)).toBeNull();
    expect(userFromAddress("no-at-sign", secret, domain)).toBeNull();
  });
});

describe("isAuthorizedInbound", () => {
  it("fails closed without a secret and checks the bearer exactly", () => {
    expect(isAuthorizedInbound("Bearer x", undefined)).toBe(false);
    expect(isAuthorizedInbound(null, "x")).toBe(false);
    expect(isAuthorizedInbound("Bearer y", "x")).toBe(false);
    expect(isAuthorizedInbound("Bearer x", "x")).toBe(true);
  });
});

describe("cleanEmailText", () => {
  it("drops reply prefixes, quoted thread and signature", () => {
    const res = cleanEmailText(
      "RE: Fwd: Turno confirmado",
      "Te confirmo el jueves 15:30.\n\n-- \nClínica\n",
    );
    expect(res).toEqual({ subject: "Turno confirmado", body: "Te confirmo el jueves 15:30." });
  });

  it("cuts at the 'El … escribió:' line and skips > lines", () => {
    const res = cleanEmailText(
      "",
      "Dale, lo vemos.\n> algo citado\nEl lun, 9 nov 2026 a las 10:00, Ana escribió:\n> más",
    );
    expect(res.body).toBe("Dale, lo vemos.");
  });

  it("handles missing parts", () => {
    expect(cleanEmailText(undefined, undefined)).toEqual({ subject: "", body: "" });
  });
});
