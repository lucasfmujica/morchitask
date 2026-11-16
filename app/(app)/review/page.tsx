import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DEFAULT_TIMEZONE, todayISO } from "@/lib/date";
import { reviewWeekFor } from "@/lib/review";

export const dynamic = "force-dynamic";

export default async function ReviewIndex() {
  const session = await auth();
  redirect(`/review/${reviewWeekFor(todayISO(session?.timezone ?? DEFAULT_TIMEZONE))}`);
}
