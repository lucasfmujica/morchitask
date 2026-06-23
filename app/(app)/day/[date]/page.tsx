import { notFound } from "next/navigation";
import { DayView } from "@/components/day/day-view";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!ISO_DATE.test(date)) notFound();
  return <DayView date={date} />;
}
