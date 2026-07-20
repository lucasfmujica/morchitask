import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { profiles, spotifyCredentials } from "@/lib/db/schema";

export async function getSpotifyCredentials(ownerId: string) {
  const [row] = await db
    .select()
    .from(spotifyCredentials)
    .where(eq(spotifyCredentials.owner_id, ownerId));
  return row ?? null;
}

export async function connectSpotify(ownerId: string, refreshToken: string, scope: string | null) {
  await db
    .insert(spotifyCredentials)
    .values({ owner_id: ownerId, refresh_token: refreshToken, scope })
    .onConflictDoUpdate({
      target: spotifyCredentials.owner_id,
      set: { refresh_token: refreshToken, scope, updated_at: new Date().toISOString() },
    });
  await db.update(profiles).set({ spotify_connected: true }).where(eq(profiles.id, ownerId));
}

export async function updateSpotifyRefreshToken(ownerId: string, refreshToken: string) {
  await db
    .update(spotifyCredentials)
    .set({ refresh_token: refreshToken, updated_at: new Date().toISOString() })
    .where(eq(spotifyCredentials.owner_id, ownerId));
}

export async function disconnectSpotify(ownerId: string) {
  await db.delete(spotifyCredentials).where(eq(spotifyCredentials.owner_id, ownerId));
  await db.update(profiles).set({ spotify_connected: false }).where(eq(profiles.id, ownerId));
}
