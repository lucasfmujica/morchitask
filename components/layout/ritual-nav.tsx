"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Moon, Sun } from "lucide-react";
import { todayISO } from "@/lib/date";
import { useDailyNote } from "@/lib/queries/daily-notes";
import { cn } from "@/lib/utils";

// Before this hour we nudge "Planificar"; after it, "Cerrar día". Easy to tweak.
const MORNING_UNTIL = 14;

type Tone = "accent" | "primary";

type Ritual = {
  key: "plan" | "shutdown";
  href: string;
  base: string;
  label: string;
  icon: typeof Sun;
  tone: Tone;
  done: boolean;
  emphasized: boolean;
};

/** Today's plan/shutdown state plus a time-of-day "do this now" hint. */
function useRitualStatus(): Ritual[] {
  const today = todayISO();
  const note = useDailyNote(today).data;

  // Compute the hour only after mount: the server renders in its own timezone,
  // so deriving emphasis during SSR would cause a hydration mismatch.
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHour(new Date().getHours());
  }, []);
  const isMorning = hour === null ? null : hour < MORNING_UNTIL;

  const planDone = !!note?.plan_completed_at;
  const shutdownDone = !!note?.shutdown_completed_at;

  return [
    {
      key: "plan",
      href: `/plan/${today}`,
      base: "/plan",
      label: "Planificar",
      icon: Sun,
      tone: "accent",
      done: planDone,
      emphasized: !planDone && isMorning === true,
    },
    {
      key: "shutdown",
      href: `/shutdown/${today}`,
      base: "/shutdown",
      label: "Cerrar día",
      icon: Moon,
      tone: "primary",
      done: shutdownDone,
      emphasized: !shutdownDone && isMorning === false,
    },
  ];
}

const LIT_TONE: Record<Tone, string> = {
  accent: "bg-accent-soft font-semibold text-accent",
  primary: "bg-primary-soft font-semibold text-primary",
};
const DOT_TONE: Record<Tone, string> = {
  accent: "bg-accent",
  primary: "bg-primary",
};

/** Trailing check (done) or dot (pending) for a ritual row/icon. */
function RitualStatus({ ritual }: { ritual: Ritual }) {
  if (ritual.done) {
    return (
      <>
        <Check className="h-3.5 w-3.5 text-success" aria-hidden />
        <span className="sr-only">hecho</span>
      </>
    );
  }
  return (
    <>
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          ritual.emphasized ? DOT_TONE[ritual.tone] : "bg-subtle",
        )}
        aria-hidden
      />
      <span className="sr-only">pendiente</span>
    </>
  );
}

/** Desktop sidebar: two ritual links matching the SidebarLink visual grammar. */
export function SidebarRituals({ pathname }: { pathname: string }) {
  const rituals = useRitualStatus();
  return (
    <div className="flex flex-col gap-0.5">
      {rituals.map((r) => {
        const active = pathname.startsWith(r.base);
        const lit = active || r.emphasized;
        const Icon = r.icon;
        return (
          <Link
            key={r.key}
            href={r.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
              lit ? LIT_TONE[r.tone] : "font-medium text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={lit ? 2.4 : 2} aria-hidden />
            <span>{r.label}</span>
            <span className="ml-auto flex items-center">
              <RitualStatus ritual={r} />
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/** Mobile top bar: the two rituals as compact icon buttons with a corner status badge. */
export function MobileRitualIcons() {
  const rituals = useRitualStatus();
  return (
    <>
      {rituals.map((r) => {
        const Icon = r.icon;
        return (
          <Link
            key={r.key}
            href={r.href}
            aria-label={r.label}
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
              r.emphasized
                ? r.tone === "accent"
                  ? "text-accent"
                  : "text-primary"
                : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden />
            <span className="absolute -right-0.5 -top-0.5 flex items-center">
              <RitualStatus ritual={r} />
            </span>
          </Link>
        );
      })}
    </>
  );
}
