import { describe, it, expect, vi } from "vitest";

// Only the pure `escapeLike` helper is exercised here. The module imports the
// Neon client, which throws without DATABASE_URL, so it's stubbed.
vi.mock("@/lib/db/client", () => ({ db: {}, dbPool: {} }));

const { escapeLike, ACCENTED, UNACCENTED } = await import("./tasks");

describe("escapeLike", () => {
  it("leaves ordinary text untouched", () => {
    expect(escapeLike("reunión semanal")).toBe("reunión semanal");
  });

  it("escapes the wildcard so a query of % does not match every row", () => {
    // Unescaped, `%${q}%` would become '%%%' — every task in the household.
    expect(escapeLike("%")).toBe("\\%");
    expect(escapeLike("50% off")).toBe("50\\% off");
  });

  it("escapes the single-character wildcard", () => {
    expect(escapeLike("_")).toBe("\\_");
    expect(escapeLike("snake_case")).toBe("snake\\_case");
  });

  it("escapes the escape character itself, and does so once", () => {
    expect(escapeLike("\\")).toBe("\\\\");
    // Order matters: a naive implementation that escapes % before \ would turn
    // "\%" into "\\\\%" (double-escaping the backslash it just added).
    expect(escapeLike("\\%")).toBe("\\\\\\%");
  });

  it("handles several metacharacters at once", () => {
    expect(escapeLike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });

  it("returns an empty string unchanged", () => {
    expect(escapeLike("")).toBe("");
  });
});

/**
 * The accent folding runs inside Postgres via translate(), so it can't be
 * unit-tested end to end without a database. What CAN be tested is the one
 * thing that would silently corrupt every search: the two maps drifting out of
 * alignment. translate() pairs them character by character, so a length
 * mismatch would map "ñ" to the wrong letter instead of erroring.
 */
describe("accent folding maps", () => {
  it("has the same number of characters on both sides", () => {
    expect([...UNACCENTED]).toHaveLength([...ACCENTED].length);
  });

  it("maps every accented character to a plain ASCII letter", () => {
    const accented = [...ACCENTED];
    const plain = [...UNACCENTED];
    accented.forEach((char, i) => {
      expect(plain[i]).toMatch(/^[a-zA-Z]$/);
      // Same case in and out, so lower() upstream stays meaningful.
      expect(plain[i] === plain[i].toUpperCase()).toBe(char === char.toUpperCase());
    });
  });

  it("covers every accent Spanish actually uses", () => {
    for (const char of "áéíóúüñÁÉÍÓÚÜÑ") expect(ACCENTED).toContain(char);
  });

  it("has no duplicate source characters, which would make the mapping ambiguous", () => {
    expect(new Set([...ACCENTED]).size).toBe([...ACCENTED].length);
  });
});
