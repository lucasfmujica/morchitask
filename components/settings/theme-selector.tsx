"use client";

import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { getStoredTheme, setTheme, type Theme } from "@/lib/theme";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light" as const, label: "Claro", icon: Sun },
  { value: "dark" as const, label: "Oscuro", icon: Moon },
  { value: "system" as const, label: "Sistema", icon: Monitor },
];

export function ThemeSelector() {
  const hydrated = useHydrated();
  const [theme, setLocal] = useState<Theme>(() =>
    typeof window !== "undefined" ? getStoredTheme() : "system",
  );

  function choose(t: Theme) {
    setLocal(t);
    setTheme(t);
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = hydrated && theme === value;
        return (
          <button
            key={value}
            onClick={() => choose(value)}
            aria-pressed={active}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-3 text-sm font-medium transition-colors",
              active
                ? "border-primary bg-primary-soft text-primary"
                : "border-border text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
