import { describe, it, expect } from "vitest";
import { baseNoiseFor, generateNoiseSamples } from "./engine";

describe("generateNoiseSamples", () => {
  const kinds = ["white", "pink", "brown"] as const;

  it("returns a buffer of the requested length", () => {
    for (const kind of kinds) {
      expect(generateNoiseSamples(kind, 1024)).toHaveLength(1024);
    }
    expect(generateNoiseSamples("white", 0)).toHaveLength(0);
  });

  it("stays within [-1, 1]", () => {
    for (const kind of kinds) {
      const out = generateNoiseSamples(kind, 4096);
      for (const v of out) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("actually produces signal (not all zeros)", () => {
    for (const kind of kinds) {
      const out = generateNoiseSamples(kind, 2048);
      expect(out.some((v) => v !== 0)).toBe(true);
    }
  });
});

describe("baseNoiseFor", () => {
  it("maps each synth kind to its base noise", () => {
    expect(baseNoiseFor("white")).toBe("white");
    expect(baseNoiseFor("pink")).toBe("pink");
    expect(baseNoiseFor("brown")).toBe("brown");
    expect(baseNoiseFor("rain")).toBe("white");
    expect(baseNoiseFor("wind")).toBe("brown");
    expect(baseNoiseFor("ocean")).toBe("brown");
  });
});
