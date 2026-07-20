import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { tasksInRange } from "@/lib/db/queries/tasks";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.householdId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  if (!start || !end) {
    return NextResponse.json({ error: "missing start or end param" }, { status: 400 });
  }
  return NextResponse.json(await tasksInRange(session.householdId, session.user.id, start, end));
}
