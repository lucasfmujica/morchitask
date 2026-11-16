"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { isTimeZone, timeInTimeZone } from "@/lib/date";
import { useChangeTimeZone } from "@/lib/queries/timezone";
import { zoneCity, zoneOffset } from "@/lib/timezones";
import { useTz } from "@/lib/use-tz";

const DISMISSED_KEY = "morchitask-tz-dismissed";

/** What to offer on this device, or null when its clock matches the account's
 *  or the person already said no to this pair. Browser only. */
function offerFor(tz: string): { zone: string; time: string } | null {
  let device: string;
  try {
    device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
  const now = new Date();
  if (!isTimeZone(device) || zoneOffset(device, now) === zoneOffset(tz, now)) return null;
  try {
    if (localStorage.getItem(DISMISSED_KEY) === `${tz}>${device}`) return null;
  } catch {
    // Private mode: ask every time rather than never.
  }
  return { zone: device, time: timeInTimeZone(now.toISOString(), device) };
}

/**
 * One line, on every screen, when this device is on a different clock from the
 * one saved on the account: "use Madrid?".
 *
 * Asked, never applied. Someone on a two-day trip may well want their day to
 * stay on home time, and a zone that changed by itself would move their plans
 * without a word.
 *
 * Compared by offset, not by name: Chrome reports Argentina as
 * `America/Buenos_Aires` and the account says `America/Argentina/Buenos_Aires`,
 * and two names for the same clock are not a reason to interrupt anyone.
 *
 * "Stay on X" is remembered in this browser for that pair of zones, so it asks
 * again only if the device moves somewhere else.
 */
export function TimezoneBanner() {
  const t = useTranslations("settings");
  const tz = useTz();
  const { change, pending } = useChangeTimeZone();
  // The device's zone and the clock only exist in the browser.
  const [offer, setOffer] = useState<{ zone: string; time: string } | null>(null);

  useEffect(() => {
     
    setOffer(offerFor(tz));
  }, [tz]);

  if (!offer) return null;

  function keep() {
    try {
      localStorage.setItem(DISMISSED_KEY, `${tz}>${offer!.zone}`);
    } catch {
      // Nothing to remember it in; it just asks again next time.
    }
    setOffer(null);
  }

  const city = zoneCity(offer.zone);
  return (
    <div
      role="status"
      className="flex animate-up flex-wrap items-center gap-x-3 gap-y-2 rounded-[22px] bg-accent-soft py-1.5 pr-1.5 pl-4 shadow-[inset_0_0_0_1px_var(--border)] [animation-duration:350ms] sm:rounded-pill"
    >
      <Globe aria-hidden className="size-4 shrink-0 text-accent" />
      <span className="min-w-[200px] flex-1 py-1 text-sm text-fg">
        {t.rich("tzBanner", {
          city,
          time: offer.time,
          b: (chunks) => <b className="font-semibold">{chunks}</b>,
          soft: (chunks) => <span className="text-muted">{chunks}</span>,
          clock: (chunks) => <span className="font-mono text-fg">{chunks}</span>,
        })}
      </span>
      <button
        type="button"
        onClick={keep}
        disabled={pending}
        className="h-[34px] cursor-pointer rounded-pill px-3.5 text-xs font-semibold text-muted transition-colors hover:bg-border"
      >
        {t("tzBannerKeep", { city: zoneCity(tz) })}
      </button>
      <button
        type="button"
        onClick={() => change(offer.zone)}
        disabled={pending}
        className="h-[34px] cursor-pointer rounded-pill bg-fg px-4 text-xs font-semibold text-bg disabled:cursor-wait disabled:opacity-60"
      >
        {t("tzBannerUse", { city })}
      </button>
    </div>
  );
}
