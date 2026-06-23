import { DayView } from "@/components/day/day-view";
import { todayISO } from "@/lib/date";

export const dynamic = "force-dynamic";

export default function TodayPage() {
  return <DayView date={todayISO()} />;
}
