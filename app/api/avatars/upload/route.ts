import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse, type NextRequest } from "next/server";
import { AVATAR_CONTENT_TYPES, MAX_AVATAR_BYTES, isValidAvatarPath } from "@/lib/avatars";
import { auth } from "@/lib/auth";

/**
 * Issues a one-shot token so the browser can send a profile photo straight to
 * Vercel Blob. Same reasoning as `/api/attachments/upload`: a Server Action
 * caps the body at 1 MB, and a phone photo is bigger than that.
 *
 * This route is the security boundary: the token is minted for exactly the
 * path the browser asks for, so it has to be inside the signed-in person's own
 * avatar folder, and only photos up to the size cap are allowed.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const session = await auth();
        if (!session?.householdId || !session.user.id) throw new Error("unauthorized");
        if (!isValidAvatarPath(pathname, session.user.id)) throw new Error("invalid path");

        return {
          allowedContentTypes: AVATAR_CONTENT_TYPES,
          maximumSizeInBytes: MAX_AVATAR_BYTES,
          // The path already ends in a fresh UUID.
          addRandomSuffix: false,
          tokenPayload: null,
        };
      },
      // The profile is updated by the `saveMyAvatar` action once the browser
      // reports success — see the attachments route for why not here.
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
