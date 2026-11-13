import { describe, expect, it } from "vitest";
import { firstName } from "./first-name";

describe("firstName", () => {
  it("keeps only the first word", () => {
    expect(firstName("Ana María López")).toBe("Ana");
    expect(firstName("  Martín   Pérez ")).toBe("Martín");
  });
  it("handles one-word and empty names", () => {
    expect(firstName("Ana")).toBe("Ana");
    expect(firstName("")).toBe("");
    expect(firstName(null)).toBe("");
  });
});
