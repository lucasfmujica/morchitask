import { describe, expect, it } from "vitest";
import es from "@/messages/es.json";
import en from "@/messages/en.json";
import {
  PRICE_MONTHLY_USD,
  PRICE_YEARLY_USD,
  SUNSAMA_MONTHLY_USD,
  SUNSAMA_YEARLY_PER_MONTH_USD,
  YEARLY_SAVING_PCT,
  formatUsd,
} from "./pricing";

/**
 * The comparison copy makes claims about ratios ("less than half", "more than
 * twice"). When Sunsama went from $20 to $22, "half" and "twice" stopped being
 * true without a single line of copy changing. These tests pin each claim to
 * the numbers, so the next price move fails here instead of on the landing.
 */
describe("the Sunsama comparison stays true", () => {
  it("our monthly price is less than half of theirs", () => {
    expect(PRICE_MONTHLY_USD * 2).toBeLessThan(SUNSAMA_MONTHLY_USD);
  });

  it("their yearly plan, per month, is still more than twice ours", () => {
    expect((PRICE_YEARLY_USD / 12) * 2).toBeLessThan(SUNSAMA_YEARLY_PER_MONTH_USD);
  });

  it("the catalogs claim 'less than half' and 'more than twice', not 'half' or 'twice'", () => {
    expect(es.marketing.price.title).toContain("menos de la mitad");
    expect(en.marketing.price.title).toContain("less than half");
    expect(es.pricing.compareBody).toContain("más del doble");
    expect(en.pricing.compareBody).toContain("more than twice");
  });

  it("no catalog string types a Sunsama price by hand", () => {
    // Prices reach the copy as {placeholders} filled from lib/pricing.ts. A
    // digit inside a sentence about Sunsama is a price that will go stale.
    const sentences = (catalog: unknown): string[] =>
      typeof catalog === "string"
        ? [catalog]
        : catalog && typeof catalog === "object"
          ? Object.values(catalog).flatMap(sentences)
          : [];
    for (const s of [...sentences(es), ...sentences(en)]) {
      if (!s.includes("Sunsama")) continue;
      expect(s.replace(/\{[^}]*\}/g, "")).not.toMatch(/\d/);
    }
  });
});

describe("our own prices", () => {
  it("derives the yearly saving from the two prices", () => {
    expect(YEARLY_SAVING_PCT).toBe(33);
  });

  it("formats dollars", () => {
    expect(formatUsd(SUNSAMA_MONTHLY_USD)).toBe("$22");
  });
});
