"use server";

import { auth } from "@/lib/auth";
import { disconnectGoogleCalendar } from "@/lib/db/queries/google";

export async function disconnectCalendar() {
  const session = await auth();
  if (!session?.user.id) return;
  await disconnectGoogleCalendar(session.user.id);
}
