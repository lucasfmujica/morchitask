"use server";

import { requireSession } from "@/lib/actions/session";
import { isTimeZone } from "@/lib/date";
import { onboardingFacts } from "@/lib/db/queries/onboarding";
import { changeTimeZone } from "@/lib/db/queries/timezone";
import { isOnboarded } from "@/lib/onboarding";

/**
 * Changes the caller's timezone.
 *
 * Not behind the write gate: someone whose trial ran out while they were
 * travelling should still see the right day on what they can read.
 *
 * `resync` is the caller's own blocks that have a Google Calendar event and
 * just moved; the client pushes them through the same route a drag uses.
 */
export async function changeMyTimeZone(zone: string) {
  const { householdId, userId } = await requireSession();
  if (!isTimeZone(zone)) throw new Error("invalid timezone");
  const res = await changeTimeZone(householdId, userId, zone);
  return { changed: res.changed, resync: res.resync };
}

/**
 * First use: start in the zone the device is in.
 *
 * A profile is created on the server at sign-in, where there is no clock to
 * read, so it starts in the default zone. Onboarding calls this once it is in
 * a browser. It only ever applies before onboarding is finished: after that
 * the zone is the person's choice, and a device in another zone gets asked
 * (the banner), not obeyed.
 */
export async function adoptDeviceTimeZone(zone: string) {
  const { householdId, userId, timezone } = await requireSession();
  if (!isTimeZone(zone) || zone === timezone) return { changed: false };
  const facts = await onboardingFacts(householdId, userId);
  if (!facts || isOnboarded(facts)) return { changed: false };
  const res = await changeTimeZone(householdId, userId, zone);
  return { changed: res.changed };
}
