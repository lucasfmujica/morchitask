import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { backlogTasks, tasksForDate } from "@/lib/db/queries/tasks";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.householdId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const date = req.nextUrl.searchParams.get("date");
  const backlog = req.nextUrl.searchParams.get("backlog");

  if (backlog) {
    return NextResponse.json(await backlogTasks(session.householdId, session.user.id));
  }
  if (date) {
    return NextResponse.json(await tasksForDate(session.householdId, session.user.id, date));
  }
  return NextResponse.json({ error: "missing date or backlog param" }, { status: 400 });
}
