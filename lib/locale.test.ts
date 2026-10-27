import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, localeFromAcceptLanguage, toLocale } from "./locale";

describe("toLocale", () => {
  it("passes through the languages the app has", () => {
    expect(toLocale("es")).toBe("es");
    expect(toLocale("en")).toBe("en");
  });

  /**
   * The whole point of the fallback: a cookie that got truncated, hand-edited,
   * or left over from a future version must render the app people already know,
   * not a blank screen.
   */
  it("falls back to Spanish for anything else", () => {
    expect(toLocale("fr")).toBe(DEFAULT_LOCALE);
    expect(toLocale("es-AR")).toBe(DEFAULT_LOCALE);
    expect(toLocale("")).toBe(DEFAULT_LOCALE);
    expect(toLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(toLocale(null)).toBe(DEFAULT_LOCALE);
    expect(toLocale(42)).toBe(DEFAULT_LOCALE);
    expect(toLocale({ locale: "en" })).toBe(DEFAULT_LOCALE);
  });
});

describe("isLocale", () => {
  it("is a type guard over exactly the supported set", () => {
    expect(isLocale("es")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("pt")).toBe(false);
    expect(isLocale("EN")).toBe(false); // callers lowercase before asking
  });
});

describe("localeFromAcceptLanguage", () => {
  it("reads the plain single-language cases", () => {
    expect(localeFromAcceptLanguage("en")).toBe("en");
    expect(localeFromAcceptLanguage("es")).toBe("es");
  });

  it("ignores the region, since es-AR and es-ES are the same catalog here", () => {
    expect(localeFromAcceptLanguage("en-GB")).toBe("en");
    expect(localeFromAcceptLanguage("es-419")).toBe("es");
  });

  it("respects quality values rather than just taking the first tag", () => {
    expect(localeFromAcceptLanguage("fr;q=0.9,en;q=0.8,es;q=0.7")).toBe("en");
    expect(localeFromAcceptLanguage("en;q=0.3,es;q=0.9")).toBe("es");
  });

  it("skips languages the app does not have", () => {
    expect(localeFromAcceptLanguage("fr-FR,fr;q=0.9,en;q=0.5")).toBe("en");
    expect(localeFromAcceptLanguage("de,fr,it")).toBe(DEFAULT_LOCALE);
  });

  it("ignores a language explicitly rejected with q=0", () => {
    expect(localeFromAcceptLanguage("en;q=0,es;q=0.5")).toBe("es");
  });

  it("falls back rather than throwing on a missing or malformed header", () => {
    expect(localeFromAcceptLanguage(null)).toBe(DEFAULT_LOCALE);
    expect(localeFromAcceptLanguage(undefined)).toBe(DEFAULT_LOCALE);
    expect(localeFromAcceptLanguage("")).toBe(DEFAULT_LOCALE);
    expect(localeFromAcceptLanguage(";;;")).toBe(DEFAULT_LOCALE);
    expect(localeFromAcceptLanguage("en;q=banana")).toBe(DEFAULT_LOCALE);
  });

  it("handles the real header a browser sends", () => {
    expect(localeFromAcceptLanguage("es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7")).toBe("es");
    expect(localeFromAcceptLanguage("en-US,en;q=0.9,es;q=0.8")).toBe("en");
  });
});
