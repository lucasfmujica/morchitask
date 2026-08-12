import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";
import { isInlineViewable } from "@/lib/attachments";
import { auth } from "@/lib/auth";
import { getAttachment } from "@/lib/db/queries/attachments";

/**
 * Serves one attachment.
 *
 * The Blob store is private: its URLs answer 403 to anyone without the store's
 * credentials, so a file can't simply be linked to. This route is how the app
 * reads one — session first, then the row (scoped to the household, so an id
 * from someone else's data finds nothing), then the bytes.
 *
 * The upshot for the household: an attachment is only reachable by someone
 * signed into this app. A link copied out of the browser is useless elsewhere.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.householdId) return new NextResponse("unauthorized", { status: 401 });

  const row = await getAttachment(session.householdId, id);
  if (!row) return new NextResponse("not found", { status: 404 });

  const file = await get(row.pathname, { access: "private" });
  if (!file) return new NextResponse("not found", { status: 404 });

  // The stored name reaches a header, so strip anything that could end the
  // quoted string or inject a second header line. The `filename*` form carries
  // the accents and emoji a phone puts in file names — a header value with a
  // character above 0xFF is rejected outright, which would turn "open the file"
  // into a 500 for anything named "Diseño.pdf".
  const safeName = row.name.replace(/["\\\r\n]/g, "");
  const asciiName = safeName.replace(/[^\x20-\x7e]/g, "_");
  const disposition = isInlineViewable(row.content_type) ? "inline" : "attachment";

  return new NextResponse(file.stream, {
    headers: {
      "Content-Type": row.content_type,
      "Content-Disposition": `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      // The bytes never change (each upload gets a fresh id), but the URL is
      // per-person data — cache it in the browser, never in a shared cache.
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
