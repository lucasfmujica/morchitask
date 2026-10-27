import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";
import { avatarPathFromSrc, isAllowedAvatarType } from "@/lib/avatars";
import { auth } from "@/lib/auth";
import { getProfile } from "@/lib/db/queries/profiles";

/**
 * Serves one person's profile photo out of the private Blob store.
 *
 * Only to someone signed in to the same household. The file is found from the
 * `avatar_url` saved in the database, not from the request's `?v=` (that is
 * only there to bust the browser cache), so nobody can point this route at a
 * file that isn't the person's current photo.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  const session = await auth();
  if (!session?.householdId) return new NextResponse("unauthorized", { status: 401 });

  const profile = await getProfile(userId);
  if (!profile || profile.household_id !== session.householdId) {
    return new NextResponse("not found", { status: 404 });
  }

  const pathname = avatarPathFromSrc(profile.avatar_url, userId);
  if (!pathname) return new NextResponse("not found", { status: 404 });

  const file = await get(pathname, { access: "private" });
  if (!file || file.statusCode !== 200) return new NextResponse("not found", { status: 404 });

  // Only ever sent as an image — anything else the store might report is
  // downgraded to a download-only type rather than trusted.
  const contentType = isAllowedAvatarType(file.blob.contentType)
    ? file.blob.contentType
    : "application/octet-stream";

  return new NextResponse(file.stream, {
    headers: {
      "Content-Type": contentType,
      // Each upload gets a fresh `?v=`, so the cached copy is never stale; the
      // photo is per-household data, so it stays out of shared caches.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
