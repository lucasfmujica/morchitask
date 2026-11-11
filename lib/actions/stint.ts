"use server";

import { requireWriteAccess } from "@/lib/actions/session";
import * as data from "@/lib/db/queries/stint";
import { fetchStintTasks, StintUnauthorized } from "@/lib/stint-api";
import { signedInLinkable, syncStintFor, type SyncResult } from "@/lib/stint-sync";

/**
 * The Stint link (lib/stint.ts). For anyone whose email is not on
 * STINT_LINK_EMAILS these answer as if the feature did not exist: the card
 * reads null and renders nothing.
 */

export async function getStintCard() {
  const me = await signedInLinkable();
  if (!me) return null;
  const link = await data.getStintLink(me.householdId, me.userId);
  return { connected: !!link, lastSyncedAt: link?.last_synced_at ?? null };
}

export async function connectStint(token: string): Promise<SyncResult> {
  await requireWriteAccess();
  const me = await signedInLinkable();
  const clean = token.trim();
  if (!me || !/^stint_[A-Za-z0-9_-]{20,100}$/.test(clean)) return { ok: false, error: "token" };
  try {
    await fetchStintTasks(clean); // proves the token before keeping it
  } catch (e) {
    return { ok: false, error: e instanceof StintUnauthorized ? "token" : "network" };
  }
  await data.saveStintLink(me.householdId, me.userId, clean);
  return syncStintFor(me.householdId, me.userId);
}

export async function disconnectStint() {
  await requireWriteAccess();
  const me = await signedInLinkable();
  if (!me) return;
  await data.deleteStintLink(me.householdId, me.userId);
}

/** Called by the app on open and when it comes back into focus. */
export async function syncStint(): Promise<SyncResult> {
  await requireWriteAccess();
  const me = await signedInLinkable();
  if (!me) return { ok: true, changed: false };
  return syncStintFor(me.householdId, me.userId);
}
