import { describe, expect, it } from "vitest";
import { isApplePlatform, MOD, SHORTCUTS, shortcutKeys } from "./shortcuts";
import es from "@/messages/es.json";
import en from "@/messages/en.json";

describe("shortcut labels", () => {
  it.each([
    [{ platform: "MacIntel" }, true],
    [{ userAgentData: { platform: "macOS" } }, true],
    [{ platform: "iPhone" }, true],
    [{ platform: "Win32" }, false],
    [{ userAgentData: { platform: "Windows" } }, false],
    [{ platform: "Linux x86_64" }, false],
    [{}, false],
  ])("reads %j as Apple: %s", (nav, apple) => {
    expect(isApplePlatform(nav)).toBe(apple);
  });

  // Regression: the palette's label said ⌘K on Windows, where the key is Ctrl.
  it("says Ctrl for the palette off Apple, ⌘ on it", () => {
    const palette = SHORTCUTS.find((s) => s.labelKey === "palette")!;
    expect(palette.keys).toContain(MOD);
    expect(shortcutKeys(palette.keys, false)).toEqual(["Ctrl", "K"]);
    expect(shortcutKeys(palette.keys, true)).toEqual(["⌘", "K"]);
  });

  it("has a label for every shortcut in both languages", () => {
    for (const s of SHORTCUTS) {
      expect((es.shortcuts as Record<string, string>)[s.labelKey]).toBeTruthy();
      expect((en.shortcuts as Record<string, string>)[s.labelKey]).toBeTruthy();
    }
  });
});
