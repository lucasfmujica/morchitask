"use client";

import { useTimeZone } from "next-intl";
import { DEFAULT_TIMEZONE } from "@/lib/date";

/**
 * The signed-in person's timezone, on the client.
 *
 * It is `profiles.timezone`, handed down by the app layout through
 * `NextIntlClientProvider`, so the server render and the browser agree on what
 * day it is. Never the browser's own zone: someone travelling keeps their day
 * until they say otherwise (Settings, or the banner that offers the switch).
 */
export function useTz(): string {
  return useTimeZone() ?? DEFAULT_TIMEZONE;
}
