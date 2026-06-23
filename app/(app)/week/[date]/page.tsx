import { notFound } from "next/navigation";
import { WeekView } from "@/components/week/week-view";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function WeekPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!ISO_DATE.test(date)) notFound();
  return <WeekView date={date} />;
}
