"use client";

import { useState } from "react";
import { getStoredTheme, setTheme, type Theme } from "@/lib/theme";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

const OPTIONS = [
  { value: "light" as const, labelKey: "themeLight" },
  { value: "dark" as const, labelKey: "themeDark" },
  { value: "system" as const, labelKey: "themeSystem" },
];

export function ThemeSelector() {
  const tr = useTranslations("settings");
  const hydrated = useHydrated();
  const [theme, setLocal] = useState<Theme>(() =>
    typeof window !== "undefined" ? getStoredTheme() : "system",
  );

  function choose(t: Theme) {
    setLocal(t);
    setTheme(t);
  }

  return (
    // Segmented pill: the track is a step darker than the well it sits in, so
    // the white selected option reads as lifted out of it.
    <div className="grid grid-cols-3 gap-0.5 rounded-pill bg-border p-1">
      {OPTIONS.map(({ value, labelKey }) => {
        const active = hydrated && theme === value;
        return (
          <button
            key={value}
            onClick={() => choose(value)}
            aria-pressed={active}
            className={cn(
              "flex h-[38px] min-w-0 cursor-pointer items-center justify-center rounded-pill px-2 text-sm font-semibold transition-colors duration-200",
              active
                ? "bg-surface text-fg shadow-[0_1px_3px_rgb(var(--shadow-color)/0.12)]"
                : "text-muted hover:text-fg",
            )}
          >
            <span className="truncate">{tr(labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
