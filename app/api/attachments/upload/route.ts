import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse, type NextRequest } from "next/server";
import {
  ALLOWED_CONTENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  isValidAttachmentPath,
} from "@/lib/attachments";
import { auth } from "@/lib/auth";
import { taskBelongsToHousehold } from "@/lib/db/queries/attachments";

/**
 * Issues a one-shot token so the browser can send a file straight to Vercel
 * Blob, instead of through a Server Action.
 *
 * Why not a Server Action like the avatar upload: actions cap the request body
 * at 1 MB by default and the platform caps it around 4.5 MB regardless, so a
 * 10 MB attachment could never fit. Having the browser upload directly sidesteps
 * both — the only thing that passes through this app is permission to do it.
 *
 * Which makes this route the security boundary. The token is minted for exactly
 * the path the browser asks for, so this is the one place that can decide
 * whether a file may be stored and where: session, task ownership, the path
 * itself, the size cap and the type list are all checked here.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await auth();
        if (!session?.householdId) throw new Error("unauthorized");

        // The client names the task it is uploading to; the path it asked for
        // has to be inside that task's folder, and that task has to be ours.
        const taskId = typeof clientPayload === "string" ? clientPayload : "";
        if (!isValidAttachmentPath(pathname, taskId)) throw new Error("invalid path");
        if (!(await taskBelongsToHousehold(session.householdId, taskId))) {
          throw new Error("task not found");
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
          // The path already ends in a fresh UUID, so a suffix would only make
          // the URL longer — and overwriting is impossible for the same reason.
          addRandomSuffix: false,
          tokenPayload: null,
        };
      },
      // The database row is written by the `addAttachment` action once the
      // browser reports success, not here: this callback never fires on
      // localhost, and it arrives from Vercel's servers with no session cookie —
      // which the auth proxy would bounce to /login. Nothing depends on it.
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(result);
  } catch (err) {
    // handleUpload throws for a malformed body as well as for our own checks;
    // either way the browser only needs to hear "no".
    const message = err instanceof Error ? err.message : "upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
