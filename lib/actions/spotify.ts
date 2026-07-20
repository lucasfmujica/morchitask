"use server";

import { auth } from "@/lib/auth";
import { disconnectSpotify as disconnectSpotifyData } from "@/lib/db/queries/spotify";

export async function disconnectSpotify() {
  const session = await auth();
  if (!session?.user.id) return;
  await disconnectSpotifyData(session.user.id);
}
