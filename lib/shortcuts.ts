import { useSyncExternalStore } from "react";

/**
 * The app's keyboard shortcuts, in one list: the `?` overlay and the help
 * page both draw it, so they cannot disagree about what a key does.
 *
 * The palette's modifier is the one platform-dependent key. It was written as
 * "⌘" for everyone, and on Windows and Linux there is no ⌘: the shortcut is
 * Ctrl+K (the handler has always accepted both), so the label told a Windows
 * user to press a key their keyboard does not have.
 */

/** Stands in for ⌘ or Ctrl, resolved per platform by `shortcutKeys`. */
export const MOD = "mod";

/** `labelKey` is a key into the `shortcuts` catalog. */
export const SHORTCUTS: { keys: string[]; labelKey: string }[] = [
  { keys: [MOD, "K"], labelKey: "palette" },
  { keys: ["N"], labelKey: "newTask" },
  { keys: ["T"], labelKey: "goToday" },
  { keys: ["←", "→"], labelKey: "navigate" },
  { keys: ["?"], labelKey: "toggleHelp" },
  { keys: ["Esc"], labelKey: "closeOpen" },
];

/** Apple keyboards say ⌘; everything else says Ctrl. Read from the user agent
 *  data when the browser offers it, the older `platform` string otherwise. */
export function isApplePlatform(nav: {
  platform?: string;
  userAgent?: string;
  userAgentData?: { platform?: string };
}): boolean {
  const p = nav.userAgentData?.platform || nav.platform || nav.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(p);
}

export function modifierLabel(apple: boolean) {
  return apple ? "⌘" : "Ctrl";
}

export function shortcutKeys(keys: readonly string[], apple: boolean): string[] {
  return keys.map((k) => (k === MOD ? modifierLabel(apple) : k));
}

const noSubscribe = () => () => {};

/**
 * Whether this browser is on an Apple device. The server cannot know, so it
 * (and the first client render) says ⌘, the label most of the people using
 * this app see; a Windows browser switches to Ctrl right after hydrating.
 */
export function useIsApple(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => isApplePlatform(navigator as Navigator & { userAgentData?: { platform?: string } }),
    () => true,
  );
}
