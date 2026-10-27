import { describe, expect, it } from "vitest";
import { isValidEmail } from "./email";

describe("isValidEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(isValidEmail("sofi@example.com")).toBe(true);
    expect(isValidEmail("lucas.mujica@sub.example.com.ar")).toBe(true);
  });

  it("accepts plus-tags and dashes, which stricter regexes wrongly reject", () => {
    expect(isValidEmail("sofi+morchi@example.com")).toBe(true);
    expect(isValidEmail("a_b-c@my-domain.io")).toBe(true);
  });

  it("rejects the typos this is actually for", () => {
    expect(isValidEmail("sofi@example")).toBe(false); // no TLD
    expect(isValidEmail("sofi.example.com")).toBe(false); // missing @
    expect(isValidEmail("@example.com")).toBe(false);
    expect(isValidEmail("sofi@")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("rejects whitespace and doubled @, so a pasted line can't slip through", () => {
    expect(isValidEmail("sofi @example.com")).toBe(false);
    expect(isValidEmail("sofi@example.com extra")).toBe(false);
    expect(isValidEmail("a@b@example.com")).toBe(false);
  });

  it("rejects an empty domain label like example..com", () => {
    expect(isValidEmail("sofi@example..com")).toBe(false);
  });

  it("rejects an absurdly long value rather than running the regex on it", () => {
    expect(isValidEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
  });
});
