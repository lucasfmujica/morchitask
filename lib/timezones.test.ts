import { describe, expect, it } from "vitest";
import { COMMON_ZONES, allZones, searchZones, zoneCity, zoneOffset } from "./timezones";
import { isTimeZone, toTimeZone } from "./date";

describe("zoneCity", () => {
  it("reads the city off the id", () => {
    expect(zoneCity("America/Argentina/Buenos_Aires")).toBe("Buenos Aires");
    expect(zoneCity("Europe/Madrid")).toBe("Madrid");
    expect(zoneCity("UTC")).toBe("UTC");
  });
});

describe("zoneOffset", () => {
  it("follows the date, because zones change offset", () => {
    expect(zoneOffset("Europe/Madrid", new Date("2026-01-15T12:00:00Z"))).toBe("GMT+1");
    expect(zoneOffset("Europe/Madrid", new Date("2026-07-15T12:00:00Z"))).toBe("GMT+2");
    expect(zoneOffset("America/Argentina/Buenos_Aires", new Date("2026-07-15T12:00:00Z"))).toBe(
      "GMT-3",
    );
  });

  it("does not throw on a zone it cannot read", () => {
    expect(zoneOffset("Not/AZone", new Date())).toBe("GMT");
  });
});

describe("searchZones", () => {
  const zones = ["America/Asuncion", "Europe/Madrid", "America/Argentina/Buenos_Aires"];

  it("ignores accents, case and underscores", () => {
    expect(searchZones(zones, "Asunción")).toEqual(["America/Asuncion"]);
    expect(searchZones(zones, "buenos a")).toEqual(["America/Argentina/Buenos_Aires"]);
  });

  it("puts a city that starts with the query before one that only contains it", () => {
    expect(searchZones(zones, "a")).toEqual([
      "America/Asuncion",
      "Europe/Madrid",
      "America/Argentina/Buenos_Aires",
    ]);
    expect(searchZones(zones, "argentina")).toEqual(["America/Argentina/Buenos_Aires"]);
  });

  it("returns everything for an empty query and nothing for no match", () => {
    expect(searchZones(zones, "  ")).toEqual(zones);
    expect(searchZones(zones, "atlantis")).toEqual([]);
  });
});

describe("the lists", () => {
  it("only offers zones the runtime can compute with", () => {
    for (const zone of COMMON_ZONES) expect(isTimeZone(zone)).toBe(true);
    expect(allZones().length).toBeGreaterThanOrEqual(COMMON_ZONES.length);
  });
});

describe("isTimeZone / toTimeZone", () => {
  it("accepts real zones and refuses everything else", () => {
    expect(isTimeZone("Europe/Madrid")).toBe(true);
    expect(isTimeZone("Europe/Atlantis")).toBe(false);
    expect(isTimeZone("")).toBe(false);
    expect(isTimeZone(null)).toBe(false);
    expect(isTimeZone("x".repeat(80))).toBe(false);
  });

  it("falls back to the default instead of storing something unusable", () => {
    expect(toTimeZone("Europe/Madrid")).toBe("Europe/Madrid");
    expect(toTimeZone("'; drop table profiles; --")).toBe("America/Argentina/Buenos_Aires");
  });
});
