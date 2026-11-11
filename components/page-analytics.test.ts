import { describe, expect, it } from "vitest";
import { stripQuery } from "./page-analytics";

describe("stripQuery", () => {
  it("keeps the page and drops everything after it", () => {
    expect(
      stripQuery({ type: "pageview", url: "https://morchitask.com/login?error=OAuth&x=1#top" }).url,
    ).toBe("https://morchitask.com/login");
  });

  it("leaves a clean URL alone", () => {
    expect(stripQuery({ type: "pageview", url: "https://morchitask.com/en/pricing" })).toEqual({
      type: "pageview",
      url: "https://morchitask.com/en/pricing",
    });
  });
});
