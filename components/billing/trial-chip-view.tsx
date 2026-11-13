import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { TrialChip as TrialChipState } from "@/lib/billing";
import { createDateLabels } from "@/lib/date-labels";
import { DEFAULT_TIMEZONE, dayISOInTimeZone } from "@/lib/date";
import { toLocale } from "@/lib/locale";
import { TRIAL_DAYS } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Calm by default; it only warms to the accent in the last few days, the same
 * stretch the banner used to cover on its own.
 *
 * Two lines rather than one: the sidebar is about 170px of text, and "Prueba
 * gratis · quedan 9 días" wraps badly there.
 */
export function TrialChipView({ chip }: { chip: TrialChipState }) {
  const t = useTranslations("billing");
  const tcm = useTranslations("common");
  const locale = toLocale(useLocale());
  const late = chip.variant === "late";

  const labels = createDateLabels(locale, {
    today: tcm("today"),
    tomorrow: tcm("tomorrow"),
    yesterday: tcm("yesterday"),
    todayLower: tcm("todayLower"),
    yesterdayLower: tcm("yesterdayLower"),
    daysAgo: (n) => tcm("daysAgo", { n }),
    monthsAgo: (n) => tcm("monthsAgo", { n }),
  });
  // The day it ends where the people using it live, the same zone "today" is.
  const endDay = dayISOInTimeZone(new Date(chip.endsAt), DEFAULT_TIMEZONE);
  const weekday = labels.weekdayName(endDay);
  const date = labels.numericDate(endDay);
  const n = chip.daysLeft;

  return (
    <Link
      href="/billing"
      aria-label={
        late ? t("chipLateAria", { n, weekday, date }) : t("chipAria", { n, total: TRIAL_DAYS })
      }
      className={cn(
        "group mt-3 -mb-1 flex shrink-0 animate-up flex-col gap-[7px] rounded-[20px] px-3.5 pt-3 pb-[11px] text-fg transition-[background-color,box-shadow,transform] duration-300 [animation-delay:400ms] hover:-translate-y-px hover:shadow-soft",
        late ? "bg-accent-soft" : "bg-surface/60 shadow-[inset_0_0_0_1px_var(--border)]",
      )}
    >
      <span className="flex items-center gap-2 text-xs font-semibold">
        <span
          aria-hidden
          className={cn("h-2 w-2 shrink-0 rounded-pill", late ? "bg-accent" : "bg-fit")}
        />
        <span className={late ? "text-accent" : "text-fg"}>
          {late ? t("chipLateTitle", { n }) : t("chipTitle")}
        </span>
      </span>
      <span className="text-2xs text-muted">
        {late
          ? t.rich("chipEnds", {
              weekday,
              date,
              t: (chunks) => <span className="font-mono text-fg tabular-nums">{chunks}</span>,
            })
          : t("chipLeft", { n, total: TRIAL_DAYS })}
      </span>
      <span
        aria-hidden
        className={cn("flex h-1 overflow-hidden rounded-pill", late ? "bg-accent/15" : "bg-border")}
      >
        <span
          className={cn(
            "block h-full animate-fill rounded-pill transition-[width] duration-500",
            late ? "bg-accent" : "bg-fit",
          )}
          style={{ width: `${chip.usedPct}%` }}
        />
      </span>
      <span
        className={cn(
          "flex items-center gap-1 text-2xs font-semibold transition-[gap] duration-200 group-hover:gap-[7px]",
          late ? "text-fg" : "text-primary",
        )}
      >
        {late ? t("chipLateCta") : t("trialWarningCta")}
        <svg
          viewBox="0 0 16 16"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M2.5 8h10M9 4.5 12.5 8 9 11.5" />
        </svg>
      </span>
    </Link>
  );
}
