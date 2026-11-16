import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { DEFAULT_TIMEZONE, todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function MonthIndexPage() {
  const session = await auth();
  redirect(`/month/${todayISO(session?.timezone ?? DEFAULT_TIMEZONE)}`);
}
