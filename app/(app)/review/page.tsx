import { redirect } from "next/navigation";
import { todayISO } from "@/lib/date";
import { reviewWeekFor } from "@/lib/review";

export const dynamic = "force-dynamic";

export default function ReviewIndex() {
  redirect(`/review/${reviewWeekFor(todayISO())}`);
}
