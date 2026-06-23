import { redirect } from "next/navigation";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

export default function MonthIndexPage() {
  redirect(`/month/${todayISO()}`);
}
