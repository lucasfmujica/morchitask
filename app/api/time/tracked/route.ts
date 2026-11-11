import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { trackedMinutesByTask } from "@/lib/db/queries/tasks";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Minutes the signed-in user tracked per task in [start, end], with each task's
 * category and estimate: `TrackedTask[]`. Feeds Resumen's category split and
 * estimate-vs-actual.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.householdId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  if (!start || !end || !ISO_DAY.test(start) || !ISO_DAY.test(end)) {
    return NextResponse.json({ error: "start and end must be YYYY-MM-DD" }, { status: 400 });
  }
  return NextResponse.json(
    await trackedMinutesByTask(session.householdId, session.user.id, start, end),
  );
}
