import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { searchTasks } from "@/lib/db/queries/tasks";

/** Shorter than this and every query matches everything — the palette shows
 *  navigation actions instead until you've typed enough to mean something. */
const MIN_QUERY_LENGTH = 2;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.householdId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const query = (req.nextUrl.searchParams.get("q") ?? "").trim();
  // An empty result is the correct answer for a too-short query, not an error:
  // the palette calls this on every keystroke.
  if (query.length < MIN_QUERY_LENGTH) return NextResponse.json([]);

  return NextResponse.json(await searchTasks(session.householdId, session.user.id, query));
}
