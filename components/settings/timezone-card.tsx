"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Search } from "lucide-react";
import { timeInTimeZone } from "@/lib/date";
import { useChangeTimeZone } from "@/lib/queries/timezone";
import { COMMON_ZONES, allZones, searchZones, zoneCity, zoneOffset } from "@/lib/timezones";
import { useTz } from "@/lib/use-tz";
import { cn } from "@/lib/utils";

/** How many matches the list shows. Typing narrows it; nobody scrolls 400 zones. */
const MAX_RESULTS = 40;

/**
 * The person's timezone: what it is, what time that makes it, and the way to
 * change it.
 *
 * Cities come from the IANA id, so they read in English ("Mexico City",
 * "Sao Paulo"); the id sits under each one so the choice is never a guess.
 * Before anyone types, the list is the short one of places the app's people
 * actually are, with the current zone on top.
 */
export function TimezoneCard() {
  const t = useTranslations("settings");
  const tz = useTz();
  const listId = useId();
  const { change, pending, failed } = useChangeTimeZone();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // The clock on the card. Seeded on mount and ticked from there: the server's
  // "now" is a different minute often enough to be a hydration mismatch.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const zones = useMemo(() => {
    if (!open) return [];
    if (!query.trim()) return [tz, ...COMMON_ZONES.filter((z) => z !== tz)];
    return searchZones(allZones(), query).slice(0, MAX_RESULTS);
  }, [open, query, tz]);

  const at = now ?? new Date(0);
  const clock = (zone: string) => (now ? timeInTimeZone(now.toISOString(), zone) : "");

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-3.5 rounded-[18px] bg-bg py-3.5 pr-3.5 pl-4">
        <span className="min-w-[4.5ch] font-display text-[30px] leading-none font-semibold tracking-[-0.01em] text-fg">
          {clock(tz)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold text-fg">{zoneCity(tz)}</span>
          <span className="truncate font-mono text-[11px] text-muted">
            {now ? `${tz} · ${zoneOffset(tz, at)}` : tz}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen((o) => !o);
            setQuery("");
          }}
          aria-expanded={open}
          aria-controls={listId}
          className="h-9 cursor-pointer rounded-pill bg-surface-2 px-3.5 text-xs font-semibold text-fg transition-colors hover:bg-border"
        >
          {open ? t("tzDone") : t("tzChange")}
        </button>
      </div>

      {open && (
        <div className="flex animate-up flex-col gap-2 [animation-duration:350ms]">
          <label className="flex h-11 items-center gap-2.5 rounded-pill bg-bg px-4 focus-within:shadow-[inset_0_0_0_1.5px_var(--fit-from)]">
            <Search aria-hidden className="size-[15px] shrink-0 text-muted" />
            <input
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-label={t("tzSearch")}
              placeholder={t("tzSearch")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted"
            />
          </label>
          <ul
            id={listId}
            role="listbox"
            aria-label={t("tzListLabel")}
            className="flex max-h-[300px] flex-col gap-0.5 overflow-auto rounded-[18px] p-1 shadow-[inset_0_0_0_1px_var(--border)]"
          >
            {zones.map((zone) => {
              const selected = zone === tz;
              return (
                <li key={zone} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => (selected ? setOpen(false) : change(zone, () => setOpen(false)))}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2 text-left transition-colors disabled:cursor-wait disabled:opacity-60",
                      selected ? "bg-primary-soft" : "hover:bg-bg",
                    )}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                      <span className="truncate text-sm font-semibold text-fg">
                        {zoneCity(zone)}
                      </span>
                      <span className="truncate font-mono text-[11px] text-muted">{zone}</span>
                    </span>
                    <span className="font-mono text-xs text-muted">{zoneOffset(zone, at)}</span>
                    <span className="w-11 text-right font-mono text-[13px] text-fg">
                      {clock(zone)}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-[18px] shrink-0 items-center justify-center rounded-full",
                        selected
                          ? "bg-[linear-gradient(135deg,var(--fit-from),var(--primary))]"
                          : "shadow-[inset_0_0_0_1.5px_var(--border-strong)]",
                      )}
                    >
                      {selected && <Check className="size-2.5 text-on-primary" strokeWidth={3.5} />}
                    </span>
                  </button>
                </li>
              );
            })}
            {zones.length === 0 && (
              <li className="px-3 py-3.5 text-[13px] text-muted">{t("tzEmpty")}</li>
            )}
          </ul>
        </div>
      )}

      {failed && (
        <p role="alert" className="text-xs text-danger">
          {t("tzError")}
        </p>
      )}
      <p className="text-xs leading-[17px] text-muted">{t("tzHint")}</p>
      <p className="text-xs leading-[17px] text-muted">{t("tzKeepNote")}</p>
    </div>
  );
}
