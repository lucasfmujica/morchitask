import { afterEach, describe, expect, it } from "vitest";
import { isAuthorizedCron } from "./cron-auth";

const withHeaders = (headers: Record<string, string>) =>
  new Request("https://example.com/api/cron/whatever", { headers });

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("isAuthorizedCron", () => {
  it("accepts the x-cron-secret header", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isAuthorizedCron(withHeaders({ "x-cron-secret": "s3cret" }))).toBe(true);
  });

  it("accepts the bearer token Vercel Cron sends", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isAuthorizedCron(withHeaders({ authorization: "Bearer s3cret" }))).toBe(true);
  });

  it("rejects a request with no credentials", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isAuthorizedCron(withHeaders({}))).toBe(false);
  });

  it("rejects a wrong secret", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isAuthorizedCron(withHeaders({ "x-cron-secret": "guess" }))).toBe(false);
    expect(isAuthorizedCron(withHeaders({ authorization: "Bearer guess" }))).toBe(false);
  });

  /**
   * The reason this file exists. The previous implementation read
   * `!secret || header === secret`, so a deploy that forgot CRON_SECRET left
   * both cron routes open to anyone — and they push to every user in the
   * database. Missing config must deny, not allow.
   */
  it("denies everything when CRON_SECRET is unset, rather than allowing it", () => {
    expect(isAuthorizedCron(withHeaders({}))).toBe(false);
    expect(isAuthorizedCron(withHeaders({ "x-cron-secret": "anything" }))).toBe(false);
    expect(isAuthorizedCron(withHeaders({ authorization: "Bearer anything" }))).toBe(false);
  });

  it("denies when CRON_SECRET is set to an empty string", () => {
    process.env.CRON_SECRET = "";
    expect(isAuthorizedCron(withHeaders({ "x-cron-secret": "" }))).toBe(false);
  });
});
